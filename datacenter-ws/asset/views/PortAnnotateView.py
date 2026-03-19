import hashlib
import os
import shutil
import threading

import yaml
from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# ── Constants ──────────────────────────────────────────────────────────────────
_CLASS_NAMES = ['RJ45', 'SFP', 'SFP+', 'USB-A', 'SERIAL', 'LC']

_PORT_CLASS_ID = {
    'RJ45': 0, 'SFP': 1, 'SFP+': 2,
    'USB-A': 3, 'SERIAL': 4, 'LC': 5,
    # Aliases
    'MGMT': 0,
}

# Estimated bounding-box dimensions as a fraction of image size (0–1)
_PORT_BW = {
    'RJ45': 0.045, 'SFP': 0.030, 'SFP+': 0.030,
    'USB-A': 0.040, 'SERIAL': 0.060, 'LC': 0.035, 'MGMT': 0.045,
}
_PORT_BH = {
    'RJ45': 0.055, 'SFP': 0.050, 'SFP+': 0.050,
    'USB-A': 0.045, 'SERIAL': 0.040, 'LC': 0.060, 'MGMT': 0.055,
}

MIN_TRAINING_IMAGES = 20

_training_state = {'is_training': False}
_training_lock = threading.Lock()


def _best_device() -> str:
    """
    Return the fastest available compute device:
      CUDA  → 'cuda'  (NVIDIA GPU)
      MPS   → 'mps'   (Apple Silicon)
      else  → 'cpu'
    """
    try:
        import torch
        if torch.cuda.is_available():
            return 'cuda'
        if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
            return 'mps'
    except Exception:
        pass
    return 'cpu'


# ── Security helpers ───────────────────────────────────────────────────────────

def _get_media_root() -> str:
    return os.path.realpath(settings.MEDIA_ROOT)


def _is_safe_relpath(relpath: str) -> bool:
    """Reject any path that could escape MEDIA_ROOT."""
    if not relpath or relpath.startswith('/') or '..' in relpath.split('/'):
        return False
    trusted = _get_media_root()
    abs_path = os.path.realpath(os.path.join(trusted, relpath))
    return abs_path.startswith(trusted + os.sep)


# ── Training helpers ───────────────────────────────────────────────────────────

def _write_data_yaml(training_dir: str) -> str:
    data_yaml = os.path.join(training_dir, 'data.yaml')
    train_img = os.path.join(training_dir, 'images', 'train')
    val_img = os.path.join(training_dir, 'images', 'val')
    # If there is no dedicated val split yet, fall back to using train images
    # for validation so YOLO doesn't abort.
    if not os.path.isdir(val_img) or not os.listdir(val_img):
        val_img = train_img
    content = {
        'train': train_img,
        'val':   val_img,
        'nc':    len(_CLASS_NAMES),
        'names': _CLASS_NAMES,
    }
    with open(data_yaml, 'w') as f:
        yaml.dump(content, f, default_flow_style=False)
    return data_yaml


def _background_train(data_yaml: str, models_dir: str) -> None:
    try:
        from ultralytics import YOLO
        device = _best_device()
        model = YOLO('yolov8n.pt')
        model.train(
            data=data_yaml,
            epochs=100,      # more headroom; early stopping handles over-training
            patience=20,     # stop if val loss doesn't improve for 20 epochs
            imgsz=640,
            optimizer='AdamW',
            device=device,
            project=models_dir,
            name='port-yolo',
            exist_ok=True,
        )
        # Promote best weights so PortAnalyzeView can find them immediately
        best = os.path.join(models_dir, 'port-yolo', 'weights', 'best.pt')
        dest = os.path.join(models_dir, 'port-yolo.pt')
        if os.path.isfile(best):
            shutil.copy2(best, dest)
    except Exception:
        pass
    finally:
        _training_state['is_training'] = False


# ── View ───────────────────────────────────────────────────────────────────────

class PortAnnotateView(APIView):
    """
    POST /asset/port-annotate

    Body:
    {
        "image_path": "components/switch.jpg",
        "side": "front",
        "annotations": [
            { "port_type": "RJ45", "pos_x": 12.5, "pos_y": 45.0, "name": "Gi0/0" }
        ]
    }

    Saves the annotations as YOLO training data and triggers background
    retraining once MIN_TRAINING_IMAGES labelled images have been collected.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        image_path = request.data.get('image_path', '')
        side = request.data.get('side', 'front')
        annotations = request.data.get('annotations', [])

        if not _is_safe_relpath(image_path):
            return Response(
                {'error': 'Invalid image path.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        media_root = _get_media_root()
        abs_image_path = os.path.join(media_root, image_path)
        if not os.path.isfile(abs_image_path):
            return Response(
                {'error': 'Image not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not isinstance(annotations, list) or not annotations:
            return Response({'saved': 0, 'total_images': 0})

        # Prepare training directories with train/val split.
        # The split is deterministic: ~20 % of images land in val based on hash.
        training_dir = os.path.join(media_root, 'training')
        images_dir = os.path.join(training_dir, 'images')
        labels_dir = os.path.join(training_dir, 'labels')

        # Derive a stable, collision-resistant filename from image_path + side
        hash_key = hashlib.sha256(
            f'{image_path}|{side}'.encode()
        ).hexdigest()[:16]

        # First hex char mod 5 == 0  →  val (~20 %);  otherwise  →  train
        split = 'val' if int(hash_key[0], 16) % 5 == 0 else 'train'
        images_split_dir = os.path.join(images_dir, split)
        labels_split_dir = os.path.join(labels_dir, split)
        os.makedirs(images_split_dir, exist_ok=True)
        os.makedirs(labels_split_dir, exist_ok=True)

        dest_image = os.path.join(images_split_dir, f'{hash_key}.jpg')
        dest_label = os.path.join(labels_split_dir, f'{hash_key}.txt')

        # Copy source image (once per image+side combination)
        if not os.path.isfile(dest_image):
            shutil.copy2(abs_image_path, dest_image)

        # Write YOLO format: class_id cx cy bw bh  (all 0–1 fractions)
        with open(dest_label, 'w') as f:
            for ann in annotations:
                port_type = str(ann.get('port_type', 'RJ45'))
                cls_id = _PORT_CLASS_ID.get(port_type, 0)
                cx = float(ann.get('pos_x', 50)) / 100.0
                cy = float(ann.get('pos_y', 50)) / 100.0
                bw = _PORT_BW.get(port_type, 0.045)
                bh = _PORT_BH.get(port_type, 0.055)
                # Keep centre within valid bounds
                cx = max(bw / 2, min(1.0 - bw / 2, cx))
                cy = max(bh / 2, min(1.0 - bh / 2, cy))
                f.write(f'{cls_id} {cx:.4f} {cy:.4f} {bw:.4f} {bh:.4f}\n')

        data_yaml = _write_data_yaml(training_dir)

        # Count labelled images across both train and val subdirs
        label_count = 0
        for sub in ('train', 'val'):
            sub_dir = os.path.join(labels_dir, sub)
            if os.path.isdir(sub_dir):
                label_count += sum(1 for fn in os.listdir(sub_dir)
                                   if fn.endswith('.txt'))
        models_dir = os.path.join(media_root, 'models')
        os.makedirs(models_dir, exist_ok=True)

        with _training_lock:
            if label_count >= MIN_TRAINING_IMAGES and not _training_state['is_training']:
                _training_state['is_training'] = True
                threading.Thread(
                    target=_background_train,
                    args=(data_yaml, models_dir),
                    daemon=True,
                ).start()

        return Response(
            {'saved': len(annotations), 'total_images': label_count},
            status=status.HTTP_200_OK,
        )
