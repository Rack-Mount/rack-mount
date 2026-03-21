"""
Management command: train_port_detector

Legge dal database tutti gli AssetModelPort che hanno coordinate (pos_x, pos_y)
impostate, genera le label YOLO corrispondenti e (opzionalmente) avvia il
fine-tuning di YOLOv8n.

Uso:
    python manage.py train_port_detector              # solo genera label
    python manage.py train_port_detector --train      # genera + addestra
    python manage.py train_port_detector --train --epochs 100 --imgsz 640
"""
import hashlib
import os
import shutil

import yaml
from django.conf import settings
from django.core.management.base import BaseCommand


# ── Mapping port_type → YOLO class_id ─────────────────────────────────────────
# Principio: una classe per ogni forma-fattore *otticamente distinguibile*.
#
#  0 – RJ45   : porta rame con tab di scatto, contatti visibili, apertura rettangolare
#  1 – SFP    : cage SFP/SFP+/SFP28 (1G/10G/25G) — forma identica, cage piccola
#  2 – QSFP   : cage QSFP+/QSFP28/QSFP-DD — visivamente più larga di SFP
#  3 – USB    : porta USB-A / USB-C
#  4 – SERIAL : porta seriale (DB9/RJ45-console)
#  5 – LC     : connettore fibra ottica LC/SC/FC
#
# NOTA: SFP e SFP+ erano classi separate (1 e 2) ma hanno cage otticamente
# identica; tenerle separate iniettava rumore ambiguo nel training e causava
# lo scivolamento delle previsioni verso la classe SFP — incluse le RJ45.
# QSFP+ era erroneamente raggruppato con SFP+ (classe 2): ora ha classe propria
# perché la cage è fisicamente più larga e riconoscibile.
PORT_CLASS_ID = {
    'RJ45':    0,
    'MGMT':    0,  # porta di gestione visivamente identica a RJ45
    'SFP':     1,
    'SFP28':   1,  # stessa cage SFP (25G)
    'SFP+':    1,  # stessa cage SFP (10G) — era classe 2, unita a 1
    'QSFP+':   2,  # cage più larga — separata da SFP
    'QSFP28':  2,
    'QSFP-DD': 2,
    'USB-A':   3,
    'USB-C':   3,
    'SERIAL':  4,
    'LC':      5,
    'SC':      5,  # stessa fisica della cage LC
    'FC':      5,
}

# Dimensioni stimate del bounding box (frazione dell'immagine).
# RJ45 ha apertura più larga e più alta rispetto alla cage SFP;
# la differenza di proporzione aiuta il modello a discriminare per forma.
PORT_BW = {
    0: 0.055,   # RJ45   — più larga della cage SFP (era 0.045)
    1: 0.030,   # SFP/SFP+/SFP28
    2: 0.045,   # QSFP   — cage più larga di SFP ma più stretta di RJ45
    3: 0.040,   # USB
    4: 0.060,   # SERIAL
    5: 0.035,   # LC
}
PORT_BH = {
    0: 0.060,   # RJ45   — più alta della cage SFP (era 0.055)
    1: 0.048,   # SFP/SFP+
    2: 0.052,   # QSFP
    3: 0.045,   # USB
    4: 0.040,   # SERIAL
    5: 0.060,   # LC
}

CLASS_NAMES = ['RJ45', 'SFP/SFP+', 'QSFP', 'USB', 'SERIAL', 'LC']


# ── Device selection ──────────────────────────────────────────────────────────
def _best_device() -> str:
    """
    Return the fastest available compute device:
      CUDA  → 'cuda' (NVIDIA GPU via CUDA)
      MPS   → 'mps'  (Apple Silicon via Metal, with runtime bug-fix patch)
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


def _apply_mps_training_patch() -> None:
    """
    Monkey-patch ultralytics TaskAlignedAssigner.get_box_metrics to work around
    a PyTorch MPS bug: boolean tensor indexing (tensor[bool_mask]) returns an
    inconsistent element count across multiple calls on the same mask, causing:

        RuntimeError: shape mismatch: value tensor of shape [N] cannot be
        broadcast to indexing result of shape [M]

    Fix: run only the get_box_metrics step on CPU; the main forward/backward
    pass and all other ops continue to execute on MPS.
    """
    try:
        from ultralytics.utils.tal import TaskAlignedAssigner

        _orig = TaskAlignedAssigner.get_box_metrics

        def _patched(self, pd_scores, pd_bboxes, gt_labels, gt_bboxes, mask_gt):
            device = pd_bboxes.device
            if device.type != 'mps':
                return _orig(self, pd_scores, pd_bboxes,
                             gt_labels, gt_bboxes, mask_gt)
            # Move inputs to CPU, compute (no boolean-indexing MPS bug there),
            # then move results back to MPS for the rest of the training step.
            cpu_result = _orig(
                self,
                pd_scores.cpu(), pd_bboxes.cpu(),
                gt_labels.cpu(), gt_bboxes.cpu(),
                mask_gt.cpu(),
            )
            return tuple(t.to(device) for t in cpu_result)

        TaskAlignedAssigner.get_box_metrics = _patched
    except Exception:
        pass


# ── Offline augmentation helpers ───────────────────────────────────────────────
# YOLO label format: class_id  cx  cy  bw  bh  (all normalised 0-1)
#
# Rotation maths for a box (cx, cy, bw, bh) in normalised coords:
#   180°      cx' = 1-cx,   cy' = 1-cy,   bw' = bw,  bh' = bh
#   90° CW    cx' = 1-cy,   cy' = cx,     bw' = bh,  bh' = bw
#   90° CCW   cx' = cy,     cy' = 1-cx,   bw' = bh,  bh' = bw

def _transform_label_r180(line: str) -> str:
    p = line.strip().split()
    if len(p) != 5:
        return line
    cls, cx, cy, bw, bh = p[0], float(p[1]), float(
        p[2]), float(p[3]), float(p[4])
    return f'{cls} {1 - cx:.4f} {1 - cy:.4f} {bw:.4f} {bh:.4f}\n'


def _transform_label_r090(line: str) -> str:
    p = line.strip().split()
    if len(p) != 5:
        return line
    cls, cx, cy, bw, bh = p[0], float(p[1]), float(
        p[2]), float(p[3]), float(p[4])
    return f'{cls} {1 - cy:.4f} {cx:.4f} {bh:.4f} {bw:.4f}\n'


def _transform_label_r270(line: str) -> str:
    p = line.strip().split()
    if len(p) != 5:
        return line
    cls, cx, cy, bw, bh = p[0], float(p[1]), float(
        p[2]), float(p[3]), float(p[4])
    return f'{cls} {cy:.4f} {1 - cx:.4f} {bh:.4f} {bw:.4f}\n'


def _write_augmented_rotations(src_img, label_lines, train_imgs, train_labs,
                               base_h, force):
    """
    Write 180°/90° CW/CCW rotated copies of *src_img* (plus adjusted labels)
    into the **train** split only – val images are never augmented so that
    validation metrics reflect real-world image orientation.

    Returns the number of newly written pairs (skips already-existing ones
    unless *force* is True).
    """
    try:
        import cv2
    except ImportError:
        return 0

    img = cv2.imread(src_img)
    if img is None:
        return 0

    rotations = [
        ('r180', cv2.ROTATE_180,                 _transform_label_r180),
        ('r090', cv2.ROTATE_90_CLOCKWISE,        _transform_label_r090),
        ('r270', cv2.ROTATE_90_COUNTERCLOCKWISE, _transform_label_r270),
    ]

    count = 0
    for suffix, rot_code, transform in rotations:
        aug_key = f'{base_h}_{suffix}'
        dest_img = os.path.join(train_imgs, 'train', f'{aug_key}.jpg')
        dest_lbl = os.path.join(train_labs, 'train', f'{aug_key}.txt')

        if os.path.isfile(dest_lbl) and not force:
            continue

        rotated = cv2.rotate(img, rot_code)
        cv2.imwrite(dest_img, rotated, [cv2.IMWRITE_JPEG_QUALITY, 95])
        with open(dest_lbl, 'w') as f:
            f.writelines(transform(l) for l in label_lines)
        count += 1

    return count


class Command(BaseCommand):
    help = 'Genera label YOLO dai port annotati nel DB e (opzionalmente) addestra YOLOv8'

    def add_arguments(self, parser):
        parser.add_argument('--train',  action='store_true',
                            help='Avvia il training YOLO dopo aver generato le label')
        parser.add_argument('--epochs', type=int, default=50)
        parser.add_argument('--imgsz',  type=int, default=640)
        parser.add_argument('--force',  action='store_true',
                            help='Rigenera le label anche se già esistono')
        parser.add_argument('--device', type=str, default=None,
                            help='Device YOLO: cuda, mps, cpu, 0, 0,1, … '
                                 '(default: auto-detect)')

    def handle(self, *args, **options):
        from asset.models.AssetModelPort import AssetModelPort

        media_root = os.path.realpath(settings.MEDIA_ROOT)
        train_imgs = os.path.join(media_root, 'training', 'images')
        train_labs = os.path.join(media_root, 'training', 'labels')
        data_yaml = os.path.join(media_root, 'training', 'data.yaml')
        models_dir = os.path.join(media_root, 'models')

        for split in ('train', 'val'):
            os.makedirs(os.path.join(train_imgs, split), exist_ok=True)
            os.makedirs(os.path.join(train_labs, split), exist_ok=True)
        os.makedirs(models_dir, exist_ok=True)

        # ── 1. Leggi porte con coordinate dal DB ──────────────────────────────
        ports_qs = (
            AssetModelPort.objects
            .filter(pos_x__isnull=False, pos_y__isnull=False)
            .select_related('asset_model')
        )

        total_ports = ports_qs.count()
        if total_ports == 0:
            self.stdout.write(self.style.WARNING(
                'Nessun port con coordinate trovato nel database. '
                'Aggiungi manualmente le porte con posizione nel pannello.'
            ))
            return

        self.stdout.write(f'Porte con coordinate nel DB: {total_ports}')

        # ── 2. Raggruppa per (asset_model, side) ─────────────────────────────
        groups: dict = {}
        for p in ports_qs:
            am = p.asset_model
            img_field = am.front_image if p.side == 'front' else am.rear_image
            if not img_field:
                continue
            img_rel = str(img_field)   # percorso relativo a MEDIA_ROOT
            key = (img_rel, p.side)
            groups.setdefault(key, []).append(p)

        self.stdout.write(f'Immagini con porte annotate: {len(groups)}')

        generated = 0
        skipped = 0

        for (img_rel, side), ports in groups.items():
            abs_img = os.path.join(media_root, img_rel)
            if not os.path.isfile(abs_img):
                self.stdout.write(self.style.WARNING(
                    f'  Immagine non trovata: {img_rel}'))
                continue

            # Key univoca per questo (immagine, lato)
            h = hashlib.sha256(f'{img_rel}|{side}'.encode()).hexdigest()[:16]
            # Deterministic 80/20 split: first hex char mod 5 == 0 → val (~20 %)
            split = 'val' if int(h[0], 16) % 5 == 0 else 'train'
            dest_img = os.path.join(train_imgs, split, f'{h}.jpg')
            dest_lbl = os.path.join(train_labs, split, f'{h}.txt')

            if os.path.isfile(dest_lbl) and not options['force']:
                skipped += 1
                continue

            # Filtra porte con tipo supportato
            valid = [(p, PORT_CLASS_ID[p.port_type])
                     for p in ports if p.port_type in PORT_CLASS_ID]
            if not valid:
                continue

            # Copia immagine
            if not os.path.isfile(dest_img):
                shutil.copy2(abs_img, dest_img)

            # Scrivi label YOLO (cx cy bw bh tutti in 0-1)
            label_lines = []
            with open(dest_lbl, 'w') as f:
                for p, cls_id in valid:
                    bw = PORT_BW[cls_id]
                    bh = PORT_BH[cls_id]
                    cx = max(bw / 2, min(1 - bw / 2, p.pos_x / 100.0))
                    cy = max(bh / 2, min(1 - bh / 2, p.pos_y / 100.0))
                    line = f'{cls_id} {cx:.4f} {cy:.4f} {bw:.4f} {bh:.4f}\n'
                    f.write(line)
                    label_lines.append(line)

            generated += 1
            # Generate 180°/90° CW/CCW rotated copies into the train split
            # so the model learns rotation-invariant port features.
            _write_augmented_rotations(
                abs_img, label_lines, train_imgs, train_labs, h, options['force'])

            # Conta anche porte senza tipo supportato per il riepilogo
            self.stdout.write(
                f'  {img_rel} [{side}] → {len(valid)} porte su {len(ports)}'
            )

        total_labeled = 0
        for sub in ('train', 'val'):
            sub_dir = os.path.join(train_labs, sub)
            if os.path.isdir(sub_dir):
                total_labeled += sum(1 for fn in os.listdir(sub_dir)
                                     if fn.endswith('.txt'))

        # ── 3. Aggiorna data.yaml ─────────────────────────────────────────────
        train_img_split = os.path.join(train_imgs, 'train')
        val_img_split = os.path.join(train_imgs, 'val')
        # Fall back to train images if no val split exists yet
        if not os.path.isdir(val_img_split) or not os.listdir(val_img_split):
            val_img_split = train_img_split
        with open(data_yaml, 'w') as f:
            yaml.dump({
                'train': train_img_split,
                'val':   val_img_split,
                'nc':    len(CLASS_NAMES),
                'names': CLASS_NAMES,
            }, f, default_flow_style=False)

        self.stdout.write(self.style.SUCCESS(
            f'\nLabel generate: {generated} nuove, {skipped} già presenti\n'
            f'Totale immagini etichettate: {total_labeled}\n'
            f'data.yaml: {data_yaml}'
        ))

        if not options['train']:
            self.stdout.write(
                '\nPer avviare il training:\n'
                '  python manage.py train_port_detector --train'
            )
            return

        # ── 4. Training YOLOv8 ────────────────────────────────────────────────
        if total_labeled == 0:
            self.stdout.write(self.style.ERROR('Nessun dato per il training.'))
            return

        try:
            from ultralytics import YOLO
        except ImportError:
            self.stdout.write(self.style.ERROR(
                'ultralytics non installato. Esegui: pip install ultralytics'
            ))
            return

        epochs = options['epochs']
        imgsz = options['imgsz']
        device = options['device'] or _best_device()
        self.stdout.write(
            f'\nAvvio training YOLOv8n: '
            f'epochs={epochs}, imgsz={imgsz}, device={device}, immagini={total_labeled}'
        )

        if device == 'mps':
            _apply_mps_training_patch()

        model = YOLO('yolov8n.pt')
        model.train(
            data=data_yaml,
            epochs=epochs,
            patience=20,       # early stopping: halt when val loss stalls
            imgsz=imgsz,
            optimizer='AdamW',
            flipud=0.5,        # 50 % chance of vertical flip → 180°-rotated images
            degrees=10,        # ±10° random rotation → tilted/angled photos
            # ── Classification-loss tuning ─────────────────────────────────
            # cls=2.0 triplica il peso della classification loss (default 0.5):
            # forza il modello a imparare feature discriminanti tra RJ45/SFP
            # invece di ottimizzare solo la localizzazione del bounding box.
            cls=2.0,
            # label_smoothing riduce l'overconfidence su patch ambigue (bordi
            # di immagine, porte parzialmente visibili) senza degrado su casi
            # chiari.
            label_smoothing=0.1,
            # mosaic=0.5: riduce la probabilità del mosaic augmentation
            # (default 1.0). Il mosaic mescola patch di dispositivi diversi
            # nello stesso sample; a bassa densità di dati può creare contesti
            # visivamente incoerenti che confondono il classificatore.
            mosaic=0.5,
            device=device,
            project=models_dir,
            name='port-yolo',
            exist_ok=True,
        )

        # Promuovi il modello migliore
        best = os.path.join(models_dir, 'port-yolo', 'weights', 'best.pt')
        dest = os.path.join(models_dir, 'port-yolo.pt')
        if os.path.isfile(best):
            shutil.copy2(best, dest)
            self.stdout.write(self.style.SUCCESS(
                f'\nModello salvato in: {dest}'))
        else:
            self.stdout.write(self.style.WARNING(
                f'best.pt non trovato in {best}'
            ))
