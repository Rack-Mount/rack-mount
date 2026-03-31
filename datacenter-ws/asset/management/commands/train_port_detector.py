"""
Management command: train_port_detector

Reads annotated AssetModelPort records from the database, generates YOLO
training labels and (optionally) fine-tunes YOLOv8n.

Usage:
    python manage.py train_port_detector              # label generation only
    python manage.py train_port_detector --train      # generate + train
    python manage.py train_port_detector --train --epochs 100 --imgsz 640
"""
import hashlib
import os
import shutil

from django.conf import settings
from django.core.management.base import BaseCommand

# Shared constants — kept in sync with the detection/correction pipeline.
from catalog.port_detection.constants import (
    CLASS_NAMES,
    PORT_BH_BY_ID as PORT_BH,
    PORT_BW_BY_ID as PORT_BW,
    PORT_CLASS_ID,
    PORT_H_MM,
    PORT_W_MM,
)
from catalog.port_detection.training_state import best_device


# ── MPS training patch ────────────────────────────────────────────────────────

def _apply_mps_training_patch() -> None:
    """
    Monkey-patch ``ultralytics.TaskAlignedAssigner.get_box_metrics`` to work
    around a PyTorch MPS bug: boolean tensor indexing returns an inconsistent
    element count across multiple calls on the same mask, producing:

        RuntimeError: shape mismatch: value tensor of shape [N] cannot be
        broadcast to indexing result of shape [M]

    Fix: run only the ``get_box_metrics`` step on CPU; the main forward /
    backward pass and all other ops continue on MPS.
    """
    try:
        from ultralytics.utils.tal import TaskAlignedAssigner

        _orig = TaskAlignedAssigner.get_box_metrics

        def _patched(self, pd_scores, pd_bboxes, gt_labels, gt_bboxes, mask_gt):
            device = pd_bboxes.device
            if device.type != 'mps':
                return _orig(self, pd_scores, pd_bboxes, gt_labels, gt_bboxes, mask_gt)
            # Compute on CPU (no boolean-indexing MPS bug); move results back.
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


# ── Bbox fraction helpers ─────────────────────────────────────────────────────

def _bbox_fractions(
    cls_id: int,
    device_w_mm: float | None,
    device_h_mm: float | None,
) -> tuple[float, float]:
    """Return (bw, bh) as normalised fractions of the image dimensions.

    When the AssetModel carries physical dimensions, fractions are derived from
    real port measurements so boxes scale correctly regardless of resolution.
    Falls back to the fixed ``PORT_BW`` / ``PORT_BH`` tables otherwise.
    """
    if device_w_mm and device_h_mm and device_w_mm > 0 and device_h_mm > 0:
        bw = max(0.01, min(0.50, PORT_W_MM[cls_id] / device_w_mm))
        bh = max(0.01, min(0.50, PORT_H_MM[cls_id] / device_h_mm))
        return bw, bh
    return PORT_BW[cls_id], PORT_BH[cls_id]


# ── Offline augmentation helpers ──────────────────────────────────────────────
# YOLO label format: class_id  cx  cy  bw  bh  (all normalised 0-1)

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


def _write_augmented_rotations(
    src_img: str,
    label_lines: list[str],
    train_imgs: str,
    train_labs: str,
    base_h: str,
    force: bool,
) -> int:
    """Write 180°/90° CW/CCW rotated copies of *src_img* into the train split.

    Validation images are never augmented so that validation metrics reflect
    real-world image orientation.

    Returns the number of newly written pairs (skips existing ones unless
    *force* is ``True``).
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


# ── Management command ────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = 'Genera label YOLO dai port annotati nel DB e (opzionalmente) addestra YOLOv8'

    def add_arguments(self, parser):
        parser.add_argument(
            '--train',  action='store_true',
            help='Avvia il training YOLO dopo aver generato le label',
        )
        parser.add_argument('--epochs', type=int, default=50)
        parser.add_argument('--imgsz',  type=int, default=640)
        parser.add_argument(
            '--force',  action='store_true',
            help='Rigenera le label anche se già esistono',
        )
        parser.add_argument(
            '--device', type=str, default=None,
            help='Device YOLO: cuda, mps, cpu, 0, 0,1, … (default: auto-detect)',
        )

    def handle(self, *args, **options):
        from catalog.models import AssetModelPort

        media_root = os.path.realpath(settings.MEDIA_ROOT)
        train_imgs = os.path.join(media_root, 'training', 'images')
        train_labs = os.path.join(media_root, 'training', 'labels')
        data_yaml = os.path.join(media_root, 'training', 'data.yaml')
        models_dir = os.path.join(media_root, 'models')

        for split in ('train', 'val'):
            os.makedirs(os.path.join(train_imgs, split), exist_ok=True)
            os.makedirs(os.path.join(train_labs, split), exist_ok=True)
        os.makedirs(models_dir, exist_ok=True)

        # ── 1. Read annotated ports from the DB ───────────────────────────────
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

        # ── 2. Group by (asset_model, side) ──────────────────────────────────
        groups: dict = {}
        for p in ports_qs:
            am = p.asset_model
            img_field = am.front_image if p.side == 'front' else am.rear_image
            if not img_field:
                continue
            key = (str(img_field), p.side)
            groups.setdefault(key, []).append(p)

        self.stdout.write(f'Immagini con porte annotate: {len(groups)}')

        generated = 0
        skipped = 0

        for (img_rel, side), ports in groups.items():
            abs_img = os.path.join(media_root, img_rel)
            if not os.path.isfile(abs_img):
                self.stdout.write(self.style.WARNING(
                    f'  Immagine non trovata: {img_rel}'
                ))
                continue

            # Unique hash for this (image, side) pair.
            h = hashlib.sha256(f'{img_rel}|{side}'.encode()).hexdigest()[:16]
            # Deterministic 80/20 split: first hex char mod 5 == 0 → val (~20 %).
            split = 'val' if int(h[0], 16) % 5 == 0 else 'train'
            dest_img = os.path.join(train_imgs, split, f'{h}.jpg')
            dest_lbl = os.path.join(train_labs, split, f'{h}.txt')

            if os.path.isfile(dest_lbl) and not options['force']:
                skipped += 1
                continue

            valid = [
                (p, PORT_CLASS_ID[p.port_type])
                for p in ports if p.port_type in PORT_CLASS_ID
            ]
            if not valid:
                continue

            if not os.path.isfile(dest_img):
                shutil.copy2(abs_img, dest_img)

            am = valid[0][0].asset_model
            device_w = float(am.width_mm) if am.width_mm else None
            device_h = float(am.height_mm) if am.height_mm else None

            label_lines = []
            with open(dest_lbl, 'w') as f:
                for p, cls_id in valid:
                    bw, bh = _bbox_fractions(cls_id, device_w, device_h)
                    cx = max(bw / 2, min(1 - bw / 2, p.pos_x / 100.0))
                    cy = max(bh / 2, min(1 - bh / 2, p.pos_y / 100.0))
                    line = f'{cls_id} {cx:.4f} {cy:.4f} {bw:.4f} {bh:.4f}\n'
                    f.write(line)
                    label_lines.append(line)

            generated += 1
            _write_augmented_rotations(
                abs_img, label_lines, train_imgs, train_labs, h, options['force']
            )

            self.stdout.write(
                f'  {img_rel} [{side}] → {len(valid)} porte su {len(ports)}'
            )

        # Count total labelled images across all splits.
        total_labeled = sum(
            sum(1 for fn in os.listdir(os.path.join(train_labs, sub))
                if fn.endswith('.txt'))
            for sub in ('train', 'val')
            if os.path.isdir(os.path.join(train_labs, sub))
        )

        # ── 3. Update data.yaml ───────────────────────────────────────────────
        import yaml

        train_img_split = os.path.join(train_imgs, 'train')
        val_img_split = os.path.join(train_imgs, 'val')
        # Fall back to train images when no val split exists yet.
        if not os.path.isdir(val_img_split) or not os.listdir(val_img_split):
            val_img_split = train_img_split
        with open(data_yaml, 'w') as f:
            yaml.dump(
                {
                    'train': train_img_split,
                    'val':   val_img_split,
                    'nc':    len(CLASS_NAMES),
                    'names': CLASS_NAMES,
                },
                f,
                default_flow_style=False,
            )

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

        # ── 4. Train YOLOv8 ──────────────────────────────────────────────────
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
        device = options['device'] or best_device()
        self.stdout.write(
            f'\nAvvio training YOLOv8n: '
            f'epochs={epochs}, imgsz={imgsz}, device={device}, '
            f'immagini={total_labeled}'
        )

        if device == 'mps':
            _apply_mps_training_patch()

        model = YOLO('yolov8n.pt')
        model.train(
            data=data_yaml,
            epochs=epochs,
            patience=20,          # early stopping: stop when val loss stalls
            imgsz=imgsz,
            optimizer='AdamW',
            flipud=0.5,           # 50 % vertical-flip augmentation
            degrees=10,           # ±10° random rotation
            # cls=2.0 triples the classification loss (default 0.5), forcing
            # the model to learn discriminative features across port types.
            cls=2.0,
            # label_smoothing reduces overconfidence on ambiguous crops.
            label_smoothing=0.1,
            # mosaic=0.5 reduces mosaic augmentation probability (default 1.0)
            # to avoid incoherent mixed-device contexts at low data density.
            mosaic=0.5,
            device=device,
            project=models_dir,
            name='port-yolo',
            exist_ok=True,
        )

        # Promote the best checkpoint to port-yolo.pt
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
