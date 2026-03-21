"""
PortCorrectionView – traccia le correzioni manuali e triggera il retraining
con logica smart.

Endpoint: POST /asset/port-correction
Body:
{
    "image_path": "components/switch.jpg",
    "side": "front",
    "pos_x": 25.4,
    "pos_y": 50.2,
    "predicted_type": "SFP",
    "actual_type": "RJ45"
}

Logica:
1. Salva il sample di training con il tipo CORRETTO (sovrascrive se esiste).
2. Aggiorna models/training_state.json:
       corrections_since_last_train += 1
       total_corrections += 1
3. Triggera il retraining in background SOLO se tutte le condizioni sono vere:
       a) corrections_since_last_train >= MIN_CORRECTIONS   (default 10)
       b) minuti dall'ultimo training  >= MIN_INTERVAL_MIN  (default 60)
       c) Nessun training già in corso

Il file training_state.json permette di mantenere lo stato anche dopo
un riavvio del server.
"""
import hashlib
import json
import os
import shutil
import threading
from datetime import datetime, timezone

from django.conf import settings
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# ── Soglie configurabili ────────────────────────────────────────────────────────
MIN_CORRECTIONS = int(getattr(settings, 'PORT_CORRECTION_MIN_CORRECTIONS', 10))
MIN_INTERVAL_MIN = int(getattr(settings, 'PORT_CORRECTION_MIN_INTERVAL_MIN', 60))

# ── Mapping YOLO ────────────────────────────────────────────────────────────────
_CLASS_NAMES = ['RJ45', 'SFP/SFP+', 'QSFP', 'USB', 'SERIAL', 'LC']

_PORT_CLASS_ID = {
    'RJ45': 0, 'MGMT': 0,
    'SFP': 1, 'SFP+': 1, 'SFP28': 1,
    'QSFP+': 2, 'QSFP28': 2, 'QSFP-DD': 2,
    'USB-A': 3, 'USB-C': 3,
    'SERIAL': 4,
    'LC': 5, 'SC': 5, 'FC': 5,
}
_PORT_BW = {
    'RJ45': 0.055, 'MGMT': 0.055,
    'SFP': 0.030, 'SFP+': 0.030, 'SFP28': 0.030,
    'QSFP+': 0.045, 'QSFP28': 0.045, 'QSFP-DD': 0.045,
    'USB-A': 0.040, 'USB-C': 0.040,
    'SERIAL': 0.060,
    'LC': 0.035, 'SC': 0.035, 'FC': 0.035,
}
_PORT_BH = {
    'RJ45': 0.060, 'MGMT': 0.060,
    'SFP': 0.048, 'SFP+': 0.048, 'SFP28': 0.048,
    'QSFP+': 0.052, 'QSFP28': 0.052, 'QSFP-DD': 0.052,
    'USB-A': 0.045, 'USB-C': 0.045,
    'SERIAL': 0.040,
    'LC': 0.060, 'SC': 0.060, 'FC': 0.060,
}

# ── Stato training ──────────────────────────────────────────────────────────────
_training_lock = threading.Lock()
_state_lock = threading.Lock()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_media_root() -> str:
    return os.path.realpath(settings.MEDIA_ROOT)


def _is_safe_relpath(relpath: str) -> bool:
    if not relpath or relpath.startswith('/') or '..' in relpath.split('/'):
        return False
    media_root = _get_media_root()
    target = os.path.realpath(os.path.join(media_root, relpath))
    return target.startswith(media_root + os.sep)


def _state_path() -> str:
    return os.path.join(_get_media_root(), 'models', 'training_state.json')


def _load_state() -> dict:
    path = _state_path()
    if os.path.isfile(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return {
        'last_training_iso': None,
        'corrections_since_last_train': 0,
        'total_corrections': 0,
        'is_training': False,
    }


def _save_state(state: dict) -> None:
    path = _state_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(state, f, indent=2)


def _minutes_since_last_train(state: dict) -> float:
    iso = state.get('last_training_iso')
    if not iso:
        return float('inf')
    try:
        last = datetime.fromisoformat(iso)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        delta = datetime.now(tz=timezone.utc) - last
        return delta.total_seconds() / 60
    except Exception:
        return float('inf')


def _best_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return 'cuda'
        if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
            return 'mps'
    except Exception:
        pass
    return 'cpu'


def _background_train(data_yaml: str, models_dir: str) -> None:
    """Addestra YOLOv8n in background e aggiorna lo stato al termine."""
    try:
        from ultralytics import YOLO
        device = _best_device()
        model = YOLO('yolov8n.pt')
        model.train(
            data=data_yaml,
            epochs=100,
            patience=20,
            imgsz=640,
            optimizer='AdamW',
            cls=2.0,
            label_smoothing=0.1,
            mosaic=0.5,
            device=device,
            project=models_dir,
            name='port-yolo',
            exist_ok=True,
        )
        best = os.path.join(models_dir, 'port-yolo', 'weights', 'best.pt')
        dest = os.path.join(models_dir, 'port-yolo.pt')
        if os.path.isfile(best):
            shutil.copy2(best, dest)
    except Exception:
        pass
    finally:
        with _state_lock:
            state = _load_state()
            state['is_training'] = False
            state['last_training_iso'] = datetime.now(tz=timezone.utc).isoformat()
            state['corrections_since_last_train'] = 0
            _save_state(state)


def _write_data_yaml(training_dir: str) -> str:
    import yaml as _yaml
    data_yaml = os.path.join(training_dir, 'data.yaml')
    train_img = os.path.join(training_dir, 'images', 'train')
    val_img = os.path.join(training_dir, 'images', 'val')
    if not os.path.isdir(val_img) or not os.listdir(val_img):
        val_img = train_img
    with open(data_yaml, 'w') as f:
        _yaml.dump({
            'train': train_img,
            'val': val_img,
            'nc': len(_CLASS_NAMES),
            'names': _CLASS_NAMES,
        }, f, default_flow_style=False)
    return data_yaml


# ── View ───────────────────────────────────────────────────────────────────────

class PortCorrectionView(APIView):
    """
    POST /asset/port-correction

    Riceve una correzione manuale (predicted_type → actual_type) e:
    1. Sovrascrive il sample di training con il tipo corretto.
    2. Aggiorna il contatore di correzioni.
    3. Lancia il retraining in background se le soglie sono raggiunte.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            name='PortCorrectionRequest',
            fields={
                'image_path': serializers.CharField(),
                'side': serializers.CharField(default='front'),
                'pos_x': serializers.FloatField(default=50.0),
                'pos_y': serializers.FloatField(default=50.0),
                'predicted_type': serializers.CharField(required=False, default=''),
                'actual_type': serializers.CharField(),
            },
        ),
        responses={
            200: inline_serializer(
                name='PortCorrectionResponse',
                fields={
                    'saved': serializers.BooleanField(),
                    'predicted_type': serializers.CharField(),
                    'actual_type': serializers.CharField(),
                    'training_triggered': serializers.BooleanField(),
                    'corrections_since_last_train': serializers.IntegerField(),
                    'total_corrections': serializers.IntegerField(),
                },
            )
        },
    )
    def post(self, request):
        image_path = (request.data.get('image_path') or '').strip()
        side = request.data.get('side', 'front')
        predicted_type = (request.data.get('predicted_type') or '').strip()
        actual_type = (request.data.get('actual_type') or '').strip()

        try:
            pos_x = float(request.data.get('pos_x', 50))
            pos_y = float(request.data.get('pos_y', 50))
        except (TypeError, ValueError):
            return Response(
                {'error': 'pos_x e pos_y devono essere numeri'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not image_path or not actual_type:
            return Response(
                {'error': 'image_path e actual_type sono obbligatori'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not _is_safe_relpath(image_path):
            return Response(
                {'error': 'Percorso immagine non valido'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        media_root = _get_media_root()
        abs_image_path = os.path.join(media_root, image_path)
        if not os.path.isfile(abs_image_path):
            return Response(
                {'error': 'Immagine non trovata'},
                status=status.HTTP_404_NOT_FOUND,
            )

        cls_id = _PORT_CLASS_ID.get(actual_type)
        if cls_id is None:
            return Response(
                {'error': f'Tipo porta non riconosciuto: {actual_type}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── 1. Salva il sample di training con il tipo CORRETTO ────────────────
        training_dir = os.path.join(media_root, 'training')
        hash_key = hashlib.sha256(
            f'{image_path}|{side}'.encode()
        ).hexdigest()[:16]
        split = 'val' if int(hash_key[0], 16) % 5 == 0 else 'train'

        images_dir = os.path.join(training_dir, 'images', split)
        labels_dir = os.path.join(training_dir, 'labels', split)
        os.makedirs(images_dir, exist_ok=True)
        os.makedirs(labels_dir, exist_ok=True)

        dest_image = os.path.join(images_dir, f'{hash_key}.jpg')
        dest_label = os.path.join(labels_dir, f'{hash_key}.txt')

        if not os.path.isfile(dest_image):
            shutil.copy2(abs_image_path, dest_image)

        # Legge le righe esistenti e sostituisce quella più vicina alla posizione
        cx = max(0.0, min(1.0, pos_x / 100.0))
        cy = max(0.0, min(1.0, pos_y / 100.0))
        bw = _PORT_BW.get(actual_type, 0.045)
        bh = _PORT_BH.get(actual_type, 0.055)
        cx = max(bw / 2, min(1.0 - bw / 2, cx))
        cy = max(bh / 2, min(1.0 - bh / 2, cy))
        new_line = f'{cls_id} {cx:.4f} {cy:.4f} {bw:.4f} {bh:.4f}\n'

        existing_lines = []
        if os.path.isfile(dest_label):
            with open(dest_label) as f:
                existing_lines = f.readlines()

        # Sostituisce la riga con centro più vicino alla posizione corretta
        best_idx = None
        best_dist = float('inf')
        for i, line in enumerate(existing_lines):
            parts = line.strip().split()
            if len(parts) == 5:
                ecx, ecy = float(parts[1]), float(parts[2])
                dist = ((ecx - cx) ** 2 + (ecy - cy) ** 2) ** 0.5
                if dist < best_dist:
                    best_dist = dist
                    best_idx = i

        PROXIMITY_THRESH = 0.05  # 5 % di immagine
        if best_idx is not None and best_dist < PROXIMITY_THRESH:
            existing_lines[best_idx] = new_line
        else:
            existing_lines.append(new_line)

        with open(dest_label, 'w') as f:
            f.writelines(existing_lines)

        data_yaml = _write_data_yaml(training_dir)
        models_dir = os.path.join(media_root, 'models')
        os.makedirs(models_dir, exist_ok=True)

        # ── 2. Aggiorna contatore correzioni ──────────────────────────────────
        should_train = False
        with _state_lock:
            state = _load_state()
            state['corrections_since_last_train'] = state.get('corrections_since_last_train', 0) + 1
            state['total_corrections'] = state.get('total_corrections', 0) + 1

            # ── 3. Valuta se avviare il retraining ────────────────────────────
            enough_corrections = state['corrections_since_last_train'] >= MIN_CORRECTIONS
            enough_time = _minutes_since_last_train(state) >= MIN_INTERVAL_MIN
            not_training = not state.get('is_training', False)

            if enough_corrections and enough_time and not_training:
                state['is_training'] = True
                should_train = True

            _save_state(state)

        if should_train:
            threading.Thread(
                target=_background_train,
                args=(data_yaml, models_dir),
                daemon=True,
            ).start()

        with _state_lock:
            state = _load_state()

        return Response(
            {
                'saved': True,
                'predicted_type': predicted_type,
                'actual_type': actual_type,
                'training_triggered': should_train,
                'corrections_since_last_train': state.get('corrections_since_last_train', 0),
                'total_corrections': state.get('total_corrections', 0),
            },
            status=status.HTTP_200_OK,
        )
