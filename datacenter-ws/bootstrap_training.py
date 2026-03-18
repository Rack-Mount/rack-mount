"""
bootstrap_training.py

Genera label YOLO a partire dalle immagini esistenti usando il rilevatore
OpenCV (stesso algoritmo di PortAnalyzeView), poi avvia il training YOLOv8.

Uso:
    python bootstrap_training.py [--train] [--epochs 50] [--imgsz 640]
"""
import argparse
import hashlib
import os
import shutil
import sys

import cv2
import numpy as np
import yaml

# ── Configurazione ─────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
FILES_DIR   = os.path.join(BASE_DIR, 'files')
TRAIN_IMGS  = os.path.join(FILES_DIR, 'training', 'images')
TRAIN_LABS  = os.path.join(FILES_DIR, 'training', 'labels')
DATA_YAML   = os.path.join(FILES_DIR, 'training', 'data.yaml')
MODELS_DIR  = os.path.join(FILES_DIR, 'models')

CLASS_NAMES = ['RJ45', 'SFP', 'SFP+', 'USB-A', 'SERIAL', 'LC']

PORT_CONFIG = {
    'LC':     {'ar_min': 0.00, 'ar_max': 0.85, 'class_id': 5,
               'bw': 0.035, 'bh': 0.060},
    'SFP+':   {'ar_min': 0.85, 'ar_max': 1.15, 'class_id': 2,
               'bw': 0.030, 'bh': 0.050},
    'SFP':    {'ar_min': 1.15, 'ar_max': 1.35, 'class_id': 1,
               'bw': 0.030, 'bh': 0.050},
    'RJ45':   {'ar_min': 1.35, 'ar_max': 2.00, 'class_id': 0,
               'bw': 0.045, 'bh': 0.055},
    'USB-A':  {'ar_min': 2.00, 'ar_max': 2.90, 'class_id': 3,
               'bw': 0.040, 'bh': 0.045},
    'SERIAL': {'ar_min': 2.90, 'ar_max': 99.0, 'class_id': 4,
               'bw': 0.060, 'bh': 0.040},
}


def classify(ar: float):
    for pt, cfg in PORT_CONFIG.items():
        if cfg['ar_min'] <= ar < cfg['ar_max']:
            return pt, cfg
    return 'RJ45', PORT_CONFIG['RJ45']


def detect_ports(image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        return []

    H, W = img.shape[:2]
    gray    = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges   = cv2.Canny(blurred, 30, 100)
    kernel  = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges   = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = W * H * 0.0008
    max_area = W * H * 0.06
    candidates = []
    bboxes = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        peri  = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
        if len(approx) < 4 or len(approx) > 6:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        if w < 8 or h < 8:
            continue

        ar = w / h
        if ar < 0.4 or ar > 5.0:
            continue

        rect_area     = w * h
        rectangularity = area / rect_area
        if rectangularity < 0.55:
            continue

        roi_mean     = float(np.mean(gray[y:y+h, x:x+w]))
        margin       = max(4, min(12, int(min(w, h) * 0.25)))
        sy0, sy1     = max(0, y - margin), min(H, y + h + margin)
        sx0, sx1     = max(0, x - margin), min(W, x + w + margin)
        surround_mean = float(np.mean(gray[sy0:sy1, sx0:sx1]))
        darkness     = max(0.0, (surround_mean - roi_mean) / (surround_mean + 1))

        if darkness < 0.06:
            continue

        confidence = rectangularity * 0.5 + darkness * 0.5
        if confidence < 0.40:
            continue

        pt, cfg = classify(ar)
        cx = (x + w / 2) / W
        cy = (y + h / 2) / H

        candidates.append({'pt': pt, 'cfg': cfg, 'cx': cx, 'cy': cy, 'conf': confidence})
        bboxes.append((w, h))

    # Size-consistency filter
    if len(bboxes) >= 4:
        areas_px = sorted(bw * bh for bw, bh in bboxes)
        med = areas_px[len(areas_px) // 2]
        candidates = [c for c, (bw, bh) in zip(candidates, bboxes)
                      if 0.25 * med <= bw * bh <= 4.0 * med]

    # NMS
    candidates.sort(key=lambda r: r['conf'], reverse=True)
    final = []
    for c in candidates:
        if any(abs(c['cx'] - f['cx']) < 0.04 and abs(c['cy'] - f['cy']) < 0.04
               for f in final):
            continue
        final.append(c)
        if len(final) >= 64:
            break

    return final


def hash_path(path: str) -> str:
    return hashlib.sha256(path.encode()).hexdigest()[:16]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--train',  action='store_true', help='Avvia training YOLO dopo la generazione delle label')
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--imgsz',  type=int, default=640)
    args = parser.parse_args()

    os.makedirs(TRAIN_IMGS, exist_ok=True)
    os.makedirs(TRAIN_LABS, exist_ok=True)
    os.makedirs(MODELS_DIR, exist_ok=True)

    # Raccogli tutte le immagini in files/ (escludendo training/)
    image_exts = {'.jpg', '.jpeg', '.png'}
    all_images = []
    for dirpath, _, filenames in os.walk(FILES_DIR):
        if 'training' in dirpath:
            continue
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in image_exts:
                all_images.append(os.path.join(dirpath, fn))

    print(f"Immagini trovate: {len(all_images)}")

    generated = 0
    skipped   = 0
    empty     = 0

    for img_path in all_images:
        h = hash_path(img_path)
        dest_img = os.path.join(TRAIN_IMGS, f'{h}.jpg')
        dest_lbl = os.path.join(TRAIN_LABS, f'{h}.txt')

        # Salta se già processata
        if os.path.isfile(dest_lbl):
            skipped += 1
            continue

        ports = detect_ports(img_path)
        if not ports:
            empty += 1
            continue  # non copiare immagini senza porte rilevate

        # Copia immagine
        if not os.path.isfile(dest_img):
            shutil.copy2(img_path, dest_img)

        # Scrivi label YOLO
        with open(dest_lbl, 'w') as f:
            for p in ports:
                cls_id = p['cfg']['class_id']
                bw     = p['cfg']['bw']
                bh     = p['cfg']['bh']
                cx     = max(bw/2, min(1 - bw/2, p['cx']))
                cy     = max(bh/2, min(1 - bh/2, p['cy']))
                f.write(f"{cls_id} {cx:.4f} {cy:.4f} {bw:.4f} {bh:.4f}\n")

        generated += 1
        print(f"  [{generated:>3}] {os.path.basename(img_path)} → {len(ports)} porte")

    total_labeled = sum(1 for fn in os.listdir(TRAIN_LABS) if fn.endswith('.txt'))
    print(f"\nRisultato: {generated} nuove label, {skipped} già presenti, {empty} immagini senza porte")
    print(f"Totale immagini etichettate: {total_labeled}")

    # Aggiorna data.yaml
    with open(DATA_YAML, 'w') as f:
        yaml.dump({
            'train': TRAIN_IMGS,
            'val':   TRAIN_IMGS,
            'nc':    len(CLASS_NAMES),
            'names': CLASS_NAMES,
        }, f, default_flow_style=False)
    print(f"data.yaml aggiornato: {DATA_YAML}")

    if total_labeled == 0:
        print("Nessun dato disponibile per il training. Uscita.")
        sys.exit(0)

    if not args.train:
        print("\nPer avviare il training esegui:")
        print(f"  python bootstrap_training.py --train --epochs {args.epochs} --imgsz {args.imgsz}")
        sys.exit(0)

    # ── Training ───────────────────────────────────────────────────────────────
    try:
        from ultralytics import YOLO
    except ImportError:
        print("ultralytics non installato. Esegui: pip install ultralytics")
        sys.exit(1)

    print(f"\nAvvio training YOLOv8n: epochs={args.epochs}, imgsz={args.imgsz}, immagini={total_labeled}")
    model = YOLO('yolov8n.pt')
    results = model.train(
        data=DATA_YAML,
        epochs=args.epochs,
        imgsz=args.imgsz,
        project=MODELS_DIR,
        name='port-yolo',
        exist_ok=True,
    )

    # Promuovi il modello migliore
    best = os.path.join(MODELS_DIR, 'port-yolo', 'weights', 'best.pt')
    dest = os.path.join(MODELS_DIR, 'port-yolo.pt')
    if os.path.isfile(best):
        shutil.copy2(best, dest)
        print(f"\nModello salvato in: {dest}")
    else:
        print(f"\nATTENZIONE: best.pt non trovato in {best}")


if __name__ == '__main__':
    main()
