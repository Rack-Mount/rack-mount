"""
Batch (full-image) port detection: OpenCV heuristic and YOLO pipelines.

``detect_with_opencv`` and ``detect_with_yolo`` are the two top-level entry
points called by PortAnalyzeView.  Both return a list of detection dicts:

    [{'port_type': 'RJ45', 'pos_x': 12.5, 'pos_y': 45.0,
      'confidence': 0.82, '_bw_pct': ..., '_bh_pct': ...}, ...]

The ``_bw_pct`` / ``_bh_pct`` fields are consumed by NMS and stripped before
the list reaches the view.
"""
import os
import tempfile

from .constants import PORT_CONFIG, YOLO_ID_TO_TYPE
from .model_cache import get_yolo_model
from .naming import classify_port_type
from .nms import bbox_nms, deduplicate_by_grid, reclassify_by_cluster
from .preprocessing import auto_canny, preprocess_for_inference


# ── OpenCV pipeline ────────────────────────────────────────────────────────────

def detect_with_opencv(image_path: str) -> list:
    """
    Detect port openings using edge detection + contour analysis.

    Pipeline
    ────────
    1. Resize to ≤ 1280 px wide for consistent area thresholds.
    2. CLAHE (local contrast normalisation).
    3. Bilateral filter (edge-preserving smoothing).
    4. Adaptive Canny + dilation + morphological close.
    5. RETR_CCOMP contour extraction (captures outer frames and inner holes).
    6. Per-contour filters: area, AR, bounding-box fill, minAreaRect fill,
       darkness score (port cavities are darker than the surrounding bezel),
       composite confidence.
    7. IQR-based size-consistency filter.
    8. Texture refinement in the ambiguous AR zone 0.90–1.50.
    9. IoU NMS → grid deduplication → cluster reclassification.

    Returns an empty list on any error (OpenCV missing, unreadable image, etc.).
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return []

    img = cv2.imread(image_path)
    if img is None:
        return []

    H_orig, W_orig = img.shape[:2]

    # Normalise to ≤ 1280 px wide so area thresholds behave consistently.
    MAX_W = 1280
    if W_orig > MAX_W:
        scale = MAX_W / W_orig
        W = MAX_W
        H = int(H_orig * scale)
        working = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
    else:
        W, H = W_orig, H_orig
        working = img

    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)

    # CLAHE: normalises local contrast for under/over-exposed photos.
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Bilateral filter preserves port-frame edges better than Gaussian.
    blurred = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

    edges = auto_canny(blurred)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)
    # Morphological close reconnects hair-line gaps in port-frame outlines
    # (caused by bezel reflections, worn coatings, JPEG ringing).
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=1)

    # RETR_CCOMP: returns both external contours and holes, so we catch port
    # openings that sit inside a larger bezel frame.
    contours, _ = cv2.findContours(
        edges, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

    min_area = max(100, W * H * 0.0004)
    max_area = W * H * 0.035

    candidates = []
    bboxes_px = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        peri = cv2.arcLength(cnt, True)
        if peri < 1:
            continue

        approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
        if len(approx) < 4 or len(approx) > 8:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        if w < 6 or h < 6:
            continue

        ar = w / h
        if ar < 0.35 or ar > 6.0:
            continue

        rect_fill = area / (w * h) if w * h else 0.0
        if rect_fill < 0.45:
            continue

        # minAreaRect fill: more accurate for slightly rotated/angled ports.
        _, (rw, rh), _ = cv2.minAreaRect(cnt)
        mar_area = rw * rh if rw > 0 and rh > 0 else 1.0
        mar_fill = area / mar_area
        if mar_fill < 0.40:
            continue

        # Darkness score: port cavities are darker than the surrounding bezel.
        roi_mean = float(np.mean(gray[y:y + h, x:x + w]))
        margin = max(4, min(16, int(min(w, h) * 0.30)))
        sy0, sy1 = max(0, y - margin), min(H, y + h + margin)
        sx0, sx1 = max(0, x - margin), min(W, x + w + margin)
        surround = gray[sy0:sy1, sx0:sx1]
        surround_mean = float(np.mean(surround)) if surround.size else roi_mean
        darkness = max(0.0, (surround_mean - roi_mean) / (surround_mean + 1.0))
        if darkness < 0.05:
            continue

        # Composite confidence from three independent signals.
        conf = min(1.0,
                   mar_fill * 0.40 +
                   rect_fill * 0.25 +
                   min(darkness * 1.75, 0.35))
        if conf < 0.38:
            continue

        port_type = classify_port_type(ar)

        # Portrait USB-A (cable plugs from top/bottom) has ar < 0.55.
        # LC fibre cages are small (bbox < 0.2 % of image); USB-A is larger.
        if port_type == 'LC' and ar < 0.55 and (w * h) / (W * H) > 0.002:
            port_type = 'USB-A'

        cx_pct = round((x + w / 2) / W * 100, 1)
        cy_pct = round((y + h / 2) / H * 100, 1)

        candidates.append({
            'port_type': port_type,
            'pos_x': cx_pct,
            'pos_y': cy_pct,
            'confidence': round(conf, 2),
            '_ar': ar,
            '_darkness': darkness,
            '_bw_pct': round(w / W * 100, 2),
            '_bh_pct': round(h / H * 100, 2),
        })
        bboxes_px.append((w, h))

    if not candidates:
        return []

    # IQR-based size-consistency filter: ports on a panel are all roughly the
    # same size; use IQR (more robust than median × 4×) to remove outliers.
    if len(bboxes_px) >= 4:
        areas_px = [bw * bh for bw, bh in bboxes_px]
        s = sorted(areas_px)
        n = len(s)
        q1, q3 = s[n // 4], s[(3 * n) // 4]
        iqr = q3 - q1
        lo_bound = max(0, q1 - 1.5 * iqr)
        hi_bound = q3 + 1.5 * iqr
        filtered = [
            c for c, (bw, bh) in zip(candidates, bboxes_px)
            if lo_bound <= bw * bh <= hi_bound
        ]
        if filtered:
            candidates = filtered

    # Texture refinement in the ambiguous AR zone 0.90–1.50:
    # SFP/SFP+ cages are metal (very dark); RJ45 inserts are plastic (lighter).
    for c in candidates:
        ar_c = c.pop('_ar', 0.0)
        dk_c = c.pop('_darkness', 0.0)
        if 0.90 <= ar_c <= 1.50:
            if dk_c > 0.30 and ar_c < 1.30:
                c['port_type'] = 'SFP' if ar_c >= 1.00 else 'SFP+'
            elif dk_c < 0.18:
                c['port_type'] = 'RJ45'

    return reclassify_by_cluster(deduplicate_by_grid(bbox_nms(candidates)))


# ── YOLO pipeline ──────────────────────────────────────────────────────────────

def _grid_dedup(detections: list) -> list:
    """
    Eliminate duplicate detections by snapping raw YOLO outputs onto the
    physical port grid — one detection per grid cell (column × row).

    Root cause of duplicates
    ────────────────────────
    YOLO fires multiple times per physical port: once on the outer metal-cage
    frame (larger bbox) and once on the inner socket void (smaller bbox,
    identical X centre, 2–5 % lower Y).  Their IoU ≈ 0.15–0.25, well below
    any practical NMS threshold, so both survive standard post-processing.

    Algorithm
    ─────────
    Pass 1 — X-column grouping:
        Sort detections by X.  Column pitch = median of consecutive X gaps
        that exceed a 0.3 % noise floor.  A new column starts when the gap
        ≥ col_pitch × 0.45 (less than half the pitch = same slot).

    Pass 2 — Y-row grouping within each column:
        A new row starts when the Y gap ≥ 8 % of image height.  This is above
        the typical outer/inner Y offset (2–5 %) and below any realistic
        row-to-row spacing (≥ 10 % on 4-row panels).

    Keep the highest-confidence detection per (column, row) cell.
    """
    _Y_ROW_SPLIT = 8.0   # % of image height

    if len(detections) < 2:
        return list(detections)

    ordered_x = sorted(detections, key=lambda d: d['pos_x'])
    xs = [d['pos_x'] for d in ordered_x]
    x_gaps = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)]

    sig_gaps = sorted(g for g in x_gaps if g > 0.3)
    col_pitch = sig_gaps[len(sig_gaps) // 2] if sig_gaps else 100.0
    eps_x = max(0.5, col_pitch * 0.45)

    columns: list = [[ordered_x[0]]]
    for i, det in enumerate(ordered_x[1:], start=1):
        if x_gaps[i - 1] < eps_x:
            columns[-1].append(det)
        else:
            columns.append([det])

    result: list = []
    for col in columns:
        by_y = sorted(col, key=lambda d: d['pos_y'])
        ys_col = [d['pos_y'] for d in by_y]
        y_gaps_col = [ys_col[i + 1] - ys_col[i]
                      for i in range(len(ys_col) - 1)]

        y_groups: list = [[by_y[0]]]
        for j, det in enumerate(by_y[1:]):
            if y_gaps_col[j] < _Y_ROW_SPLIT:
                y_groups[-1].append(det)
            else:
                y_groups.append([det])

        for grp in y_groups:
            result.append(max(grp, key=lambda d: d['confidence']))

    return result


def _extract_yolo_detections(results, id_to_type: dict) -> list:
    """Convert ultralytics Results objects to the internal detection dict format."""
    out = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            cls_id = int(box.cls[0].item())
            port_type = id_to_type.get(cls_id, 'RJ45')
            norm = box.xywhn[0].tolist()   # [cx, cy, w, h] normalised 0–1
            out.append({
                'port_type': port_type,
                'pos_x': round(norm[0] * 100, 1),
                'pos_y': round(norm[1] * 100, 1),
                'confidence': round(float(box.conf[0].item()), 2),
                '_bw_pct': round(norm[2] * 100, 2),
                '_bh_pct': round(norm[3] * 100, 2),
            })
    return out


def detect_with_yolo(image_path: str, model_path: str | None = None) -> list:
    """
    Run YOLOv8 inference and return exactly one detection per physical port.

    Pipeline
    ────────
    1. CLAHE + unsharp-mask preprocessing → sharper port features.
    2. Single full-image pass at ``imgsz=1280``, ``conf=0.25``, ``iou=0.30``.
       Permissive threshold catches all genuine ports; ``_grid_dedup``
       collapses duplicates afterwards.
    3. :func:`_grid_dedup` → one detection per (column, row) grid cell.
    4. :func:`bbox_nms` → IoU / IoMin safety net for residual overlaps.
    5. :func:`reclassify_by_cluster` → row-majority-vote type correction.

    Parameters
    ----------
    image_path:
        Absolute path to the source image.
    model_path:
        Path to ``.pt`` weights.  Defaults to
        ``<MEDIA_ROOT>/models/port-yolo.pt`` when *None*.

    Returns
    -------
    list
        Detection dicts (``_bw_pct`` / ``_bh_pct`` already stripped by NMS).
    """
    model = get_yolo_model(model_path)
    if model is None:
        return []

    img_orig = None
    preprocessed_path = None
    infer_path = image_path

    try:
        import cv2
        img_orig = cv2.imread(image_path)
        if img_orig is not None:
            enhanced = preprocess_for_inference(img_orig)
            tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
            tmp.close()
            preprocessed_path = tmp.name
            cv2.imwrite(preprocessed_path, enhanced,
                        [cv2.IMWRITE_JPEG_QUALITY, 95])
            infer_path = preprocessed_path
    except Exception:
        pass

    # Use imgsz=1280 for panels wider than 640 px.  Dense 48-port panels at
    # typical shooting distance have port widths of only 20–30 px at 640;
    # 1280 doubles that to 40–60 px, well within model training range.
    imgsz = 1280
    if img_orig is not None:
        try:
            h, w = img_orig.shape[:2]
            if w <= 640 and h <= 640:
                imgsz = 640
        except Exception:
            pass

    try:
        raw = _extract_yolo_detections(
            model.predict(
                infer_path,
                verbose=False,
                conf=0.25,          # permissive: _grid_dedup handles dupes
                iou=0.30,           # tighter YOLO NMS to drop high-overlap anchors
                agnostic_nms=True,  # collapse cross-class overlaps inside YOLO
                imgsz=imgsz,
                max_det=512,
            ),
            YOLO_ID_TO_TYPE,
        )
    finally:
        if preprocessed_path:
            try:
                os.remove(preprocessed_path)
            except OSError:
                pass

    return reclassify_by_cluster(bbox_nms(_grid_dedup(raw)))
