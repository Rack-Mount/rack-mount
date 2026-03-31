"""
Single-click port detection: OpenCV heuristic and YOLO pipelines.

Both :func:`detect_with_yolo` and :func:`detect_with_opencv` accept an
already-loaded BGR image and the click coordinates (percent of image width/
height) and return ``(port_type, confidence)``.
"""
from .constants import AR_RANGES, YOLO_ID_TO_TYPE
from .model_cache import get_yolo_model
from .preprocessing import auto_canny, preprocess_for_inference


# ── Helpers ────────────────────────────────────────────────────────────────────

def _crop_around_click(img, click_x_pct: float, click_y_pct: float,
                       pad_pct: float):
    """
    Crop a region around the click point.

    Parameters
    ----------
    img:
        Full BGR image.
    click_x_pct / click_y_pct:
        Click position as a percentage of image width/height (0–100).
    pad_pct:
        Half-width / half-height of the crop as a fraction of image width/height.

    Returns
    -------
    tuple
        ``(crop, x1, y1, crop_cx, crop_cy)`` where *crop_cx/crop_cy* are the
        click coordinates relative to the top-left of the returned crop.
    """
    h, w = img.shape[:2]
    cx = int(click_x_pct / 100.0 * w)
    cy = int(click_y_pct / 100.0 * h)
    pad_x = int(w * pad_pct)
    pad_y = int(h * pad_pct)
    x1 = max(0, cx - pad_x)
    y1 = max(0, cy - pad_y)
    x2 = min(w, cx + pad_x)
    y2 = min(h, cy + pad_y)
    return img[y1:y2, x1:x2], x1, y1, cx - x1, cy - y1


def _ar_to_type(ar: float) -> str:
    """Map a bounding-box aspect ratio to a port type (click-detection path)."""
    for ar_min, ar_max, ptype in AR_RANGES:
        if ar_min <= ar < ar_max:
            return ptype
    return 'OTHER'


# ── YOLO click detection ───────────────────────────────────────────────────────

def detect_with_yolo(img, click_x: float, click_y: float):
    """
    Multi-scale YOLO detection centred on the click point.

    Evaluates three crop sizes (padding 14 %, 22 %, 32 % of image dimensions)
    and selects the detection closest to the click with the highest combined
    score (confidence − 0.3 × normalised distance).

    Parameters
    ----------
    img:
        Full BGR image.
    click_x / click_y:
        Click position as percentages (0–100).

    Returns
    -------
    tuple
        ``(port_type, confidence)`` or ``(None, 0.0)`` if no model available.
    """
    model = get_yolo_model()
    if model is None:
        return None, 0.0

    try:
        best_type, best_conf, best_dist = None, 0.0, float('inf')

        for pad in (0.14, 0.22, 0.32):
            crop, _, _, crop_cx, crop_cy = _crop_around_click(
                img, click_x, click_y, pad_pct=pad)
            if crop.size == 0:
                continue

            crop_proc = preprocess_for_inference(crop)
            results = model(crop_proc, verbose=False, conf=0.18, iou=0.40)[0]

            if results.boxes is None or len(results.boxes) == 0:
                continue

            for box in results.boxes:
                bx = float(box.xywh[0][0])
                by = float(box.xywh[0][1])
                dist = ((bx - crop_cx) ** 2 + (by - crop_cy) ** 2) ** 0.5
                conf = float(box.conf[0])
                crop_diag = (crop.shape[0] ** 2 + crop.shape[1] ** 2) ** 0.5
                score = conf - 0.3 * (dist / (crop_diag + 1))
                current_score = best_conf - 0.3 * (best_dist / (crop_diag + 1))
                if score > current_score:
                    best_conf = conf
                    best_dist = dist
                    best_type = YOLO_ID_TO_TYPE.get(int(box.cls[0]), 'OTHER')

        return best_type, best_conf

    except Exception:
        return None, 0.0


# ── OpenCV click detection ─────────────────────────────────────────────────────

def detect_with_opencv(img, click_x: float, click_y: float):
    """
    Fallback OpenCV detection centred on the click point.

    Identical pipeline to the batch OpenCV detector but scoped to a single
    crop around the click:

    • Bilateral filter (edge-preserving)
    • Adaptive Canny
    • Fill ratio + minAreaRect fill ratio
    • Darkness score (distinguishes SFP metal cage from RJ45 plastic insert)
    • Texture refinement in the ambiguous AR zone 0.90–1.50
    • Proximity bonus: box closer to the click scores higher

    Confidence is capped at 0.65 (fallback path, not as reliable as YOLO).

    Returns
    -------
    tuple
        ``(port_type, confidence)``.
    """
    try:
        import cv2
        import numpy as np

        crop, _, _, crop_cx, crop_cy = _crop_around_click(
            img, click_x, click_y, pad_pct=0.22)
        if crop.size == 0:
            return 'RJ45', 0.0

        H, W = crop.shape[:2]

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

        blurred = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)
        edges = auto_canny(blurred)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edges = cv2.dilate(edges, kernel, iterations=1)
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=1)

        contours, _ = cv2.findContours(
            edges, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

        min_area = max(60, W * H * 0.0004)
        max_area = W * H * 0.50   # permissive upper bound for small crops

        best = None
        best_score = -1.0

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area or area > max_area:
                continue

            peri = cv2.arcLength(cnt, True)
            if peri < 1:
                continue

            approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
            if len(approx) < 4 or len(approx) > 10:
                continue

            x, y, cw, ch = cv2.boundingRect(cnt)
            if cw < 4 or ch < 4:
                continue

            ar = cw / ch
            if ar < 0.30 or ar > 7.0:
                continue

            rect_fill = area / (cw * ch) if cw * ch > 0 else 0.0
            if rect_fill < 0.40:
                continue

            _, (rw, rh), _ = cv2.minAreaRect(cnt)
            mar_area = rw * rh if rw > 0 and rh > 0 else 1.0
            mar_fill = area / mar_area
            if mar_fill < 0.35:
                continue

            roi_mean = float(np.mean(gray[y:y + ch, x:x + cw]))
            margin = max(3, min(12, int(min(cw, ch) * 0.30)))
            sy0, sy1 = max(0, y - margin), min(H, y + ch + margin)
            sx0, sx1 = max(0, x - margin), min(W, x + cw + margin)
            surround = gray[sy0:sy1, sx0:sx1]
            surround_mean = float(np.mean(surround)) if surround.size else roi_mean
            darkness = max(0.0, (surround_mean - roi_mean) / (surround_mean + 1.0))
            if darkness < 0.04:
                continue

            conf = min(1.0, mar_fill * 0.40 + rect_fill * 0.25
                       + min(darkness * 1.75, 0.35))
            if conf < 0.35:
                continue

            # Proximity to click: significant bonus for the most central box.
            ccx, ccy = x + cw / 2, y + ch / 2
            dist = ((ccx - crop_cx) ** 2 + (ccy - crop_cy) ** 2) ** 0.5
            max_dist = (W ** 2 + H ** 2) ** 0.5
            proximity = max(0.0, 1.0 - dist / max_dist)
            score = conf * 0.60 + proximity * 0.40

            if score > best_score:
                best_score = score
                best = {'ar': ar, 'darkness': darkness, 'conf': conf}

        if best is None:
            return 'RJ45', 0.0

        port_type = _ar_to_type(best['ar'])

        # Texture refinement in the ambiguous AR zone.
        ar_c, dk_c = best['ar'], best['darkness']
        if 0.90 <= ar_c <= 1.50:
            if dk_c > 0.30 and ar_c < 1.30:
                port_type = 'SFP' if ar_c >= 1.00 else 'SFP+'
            elif dk_c < 0.18:
                port_type = 'RJ45'

        return port_type, round(min(0.65, best['conf']), 3)

    except Exception:
        return 'RJ45', 0.0
