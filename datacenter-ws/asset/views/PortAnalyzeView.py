import os

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# ── Port type definitions ──────────────────────────────────────────────────────
# Aspect-ratio ranges (width / height) for each port family.
# AR ranges are calibrated on real equipment front-panel photographs.
# Dense 1U switches (48 ports/2 rows) have RJ45 openings with AR ~1.10-1.30,
# which is why the old boundary of 1.35 caused them to be classified as SFP.
# The cluster-based reclassification (_reclassify_by_cluster) is the second
# line of defence for edge cases that straddle any single boundary.
_PORT_CONFIG = {
    'LC':     {'ar_min': 0.00, 'ar_max': 0.80, 'class_id': 5},
    'SFP+':   {'ar_min': 0.80, 'ar_max': 1.00, 'class_id': 2},
    'SFP':    {'ar_min': 1.00, 'ar_max': 1.20, 'class_id': 1},
    'RJ45':   {'ar_min': 1.20, 'ar_max': 2.00, 'class_id': 0},   # lowered from 1.35
    'USB-A':  {'ar_min': 2.00, 'ar_max': 2.90, 'class_id': 3},
    'SERIAL': {'ar_min': 2.90, 'ar_max': 99.0, 'class_id': 4},
}

# Templates give distinct prefixes per type so mixed panels don't produce
# colliding names (SFP and SFP+ used to share the same template).
_PORT_NAME_TEMPLATES = {
    'RJ45':   'GigabitEthernet0/{}',
    'SFP':    'TenGigabitEthernet0/{}',
    'SFP+':   'TwentyFiveGigE0/{}',
    'USB-A':  'USB{}',
    'SERIAL': 'Serial0/{}',
    'LC':     'LC{}',
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_media_root() -> str:
    return os.path.realpath(settings.MEDIA_ROOT)


def _is_safe_relpath(relpath: str) -> bool:
    """Reject any path that could escape MEDIA_ROOT."""
    if not relpath or relpath.startswith('/') or '..' in relpath.split('/'):
        return False
    trusted = _get_media_root()
    abs_path = os.path.realpath(os.path.join(trusted, relpath))
    return abs_path.startswith(trusted + os.sep)


def _classify_port_type(ar: float) -> str:
    for pt, cfg in _PORT_CONFIG.items():
        if cfg['ar_min'] <= ar < cfg['ar_max']:
            return pt
    return 'RJ45'


def _name_group(items: list, template: str) -> None:
    """
    Sort a single port-type group into rows and assign sequential names.

    Rows are detected by clustering ports by Y position: a new row starts
    whenever the gap between consecutive Y values (sorted ascending) exceeds
    max(8 %, 2 × median inter-port gap).  Within each row, ports are sorted
    left-to-right.  The final counter is sequential across rows
    (top-to-bottom, left-to-right).
    """
    if len(items) == 1:
        items[0]['name'] = template.format(0)
        return

    by_y = sorted(items, key=lambda p: p['pos_y'])
    y_vals = [p['pos_y'] for p in by_y]
    gaps = [y_vals[i + 1] - y_vals[i] for i in range(len(y_vals) - 1)]

    if gaps:
        median_gap = sorted(gaps)[len(gaps) // 2]
        row_threshold = max(8.0, median_gap * 2.0)
    else:
        row_threshold = 8.0

    rows: list = []
    current_row = [by_y[0]]
    for i, p in enumerate(by_y[1:]):
        if gaps[i] > row_threshold:
            rows.append(current_row)
            current_row = [p]
        else:
            current_row.append(p)
    rows.append(current_row)

    for row in rows:
        row.sort(key=lambda p: p['pos_x'])

    idx = 0
    for row in rows:
        for p in row:
            p['name'] = template.format(idx)
            idx += 1


def _assign_names(ports: list) -> list:
    """
    Group ports by type, assign row-aware sequential names to each group.
    Each port type is numbered independently from 0.
    """
    by_type: dict = {}
    for p in ports:
        by_type.setdefault(p['port_type'], []).append(p)
    for pt, items in by_type.items():
        _name_group(items, _PORT_NAME_TEMPLATES.get(pt, '{}'))
    return ports


# ── OpenCV helpers ─────────────────────────────────────────────────────────────

def _auto_canny(gray):
    """
    Compute adaptive Canny thresholds from the image median intensity
    (sigma method).  Works much better than fixed thresholds across the
    wide range of exposure levels found in equipment photos.
    """
    import cv2
    import numpy as np
    v = float(np.median(gray))
    sigma = 0.33
    lo = max(10, int((1.0 - sigma) * v))
    hi = min(250, int((1.0 + sigma) * v))
    if hi < lo * 2:
        hi = min(250, lo * 3)
    return cv2.Canny(gray, lo, hi)


def _centroid_nms(
    candidates: list,
    x_thresh: float = 3.0,
    y_thresh: float = 5.0,
    max_det: int = 96,
) -> list:
    """
    Asymmetric centroid-based NMS.

    Ports in a dense row are much closer horizontally than vertically, so
    x_thresh < y_thresh avoids suppressing neighbouring ports in the same row
    while still removing true duplicates.
    """
    ordered = sorted(candidates, key=lambda c: c['confidence'], reverse=True)
    final = []
    for c in ordered:
        if any(
            abs(c['pos_x'] - f['pos_x']) < x_thresh and
            abs(c['pos_y'] - f['pos_y']) < y_thresh
            for f in final
        ):
            continue
        final.append(c)
        if len(final) >= max_det:
            break
    return final


def _reclassify_by_cluster(detections: list) -> list:
    """
    Context-aware port type correction: row clustering + majority vote.

    On a real equipment panel, all ports in a given physical row are the same
    connector type.  After AR/texture classification, occasional outliers
    (e.g., an RJ45 port whose contour yielded an AR just below the SFP
    boundary) are corrected by looking at what the rest of the row is.

    Algorithm:
      1. Cluster detections into horizontal rows using the same gap-threshold
         logic as _name_group (new row when Y gap > max(8%, 2 × median Y gap)).
      2. For each row with ≥ 4 ports, measure X-spacing uniformity
         (coefficient of variation ≤ 35 %).
      3. If ≥ 65 % of the ports in a uniform row share one type, reassign
         ALL ports in that row to the dominant type.
    """
    if len(detections) < 4:
        return detections

    by_y = sorted(detections, key=lambda c: c['pos_y'])
    y_vals = [c['pos_y'] for c in by_y]
    gaps = [y_vals[i + 1] - y_vals[i] for i in range(len(y_vals) - 1)]
    if not gaps:
        return detections

    median_gap = sorted(gaps)[len(gaps) // 2]
    row_threshold = max(8.0, median_gap * 2.0)

    rows: list = []
    current: list = [by_y[0]]
    for i, c in enumerate(by_y[1:]):
        if gaps[i] > row_threshold:
            rows.append(current)
            current = [c]
        else:
            current.append(c)
    rows.append(current)

    for row in rows:
        if len(row) < 4:
            continue

        xs = sorted(c['pos_x'] for c in row)
        x_gaps = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)]
        if not x_gaps:
            continue
        mean_xg = sum(x_gaps) / len(x_gaps)
        if mean_xg < 0.5:
            continue  # degenerate: all ports at the same X
        variance = sum((g - mean_xg) ** 2 for g in x_gaps) / len(x_gaps)
        cv = (variance ** 0.5) / mean_xg
        if cv > 0.35:
            continue  # non-uniform spacing → mixed panel section, skip

        type_counts: dict = {}
        for c in row:
            type_counts[c['port_type']] = type_counts.get(c['port_type'], 0) + 1

        dominant = max(type_counts, key=lambda t: type_counts[t])
        if type_counts[dominant] / len(row) >= 0.65:
            for c in row:
                c['port_type'] = dominant

    return detections


# ── OpenCV detection ───────────────────────────────────────────────────────────

def _detect_with_opencv(image_path: str) -> list:
    """
    Detect port openings using improved Canny edge detection + contour analysis.

    Improvements over V1:
    • Bilateral filter (edge-preserving) instead of Gaussian blur.
    • Adaptive Canny thresholds derived from image median intensity.
    • Working resolution capped at 1280 px wide for consistent area thresholds
      regardless of the original image resolution.
    • RETR_CCOMP to capture both outer frames and inner port holes.
    • minAreaRect fill-ratio as a second rectangularity check (handles
      slightly rotated port edges).
    • IQR-based size-consistency filter instead of simple median × 4×.
    • Asymmetric centroid NMS (3 % X, 5 % Y) for dense port panels.
    • Max 96 detections (was 64).
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

    # Normalise to a working width of at most 1280 px so that area-based
    # thresholds behave consistently regardless of source resolution.
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

    # Bilateral filter preserves edges much better than Gaussian; this reduces
    # false contours along textured bezels.
    blurred = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

    # Adaptive Canny + dilation
    edges = _auto_canny(blurred)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)

    # RETR_CCOMP returns both external contours and holes, so we catch port
    # openings that sit inside a larger bezel frame.
    contours, _ = cv2.findContours(edges, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

    # Area floor: absolute pixel minimum prevents noise detections on small images.
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

        # Standard bounding-box fill ratio
        rect_fill = area / (w * h) if w * h else 0.0
        if rect_fill < 0.45:
            continue

        # Minimum-area rectangle fill ratio – more accurate for ports that are
        # slightly rotated or photographed at a mild angle.
        _, (rw, rh), _ = cv2.minAreaRect(cnt)
        mar_area = rw * rh if rw > 0 and rh > 0 else 1.0
        mar_fill = area / mar_area
        if mar_fill < 0.40:
            continue

        # Darkness score – port holes are darker than the surrounding bezel.
        roi_mean = float(np.mean(gray[y:y + h, x:x + w]))
        margin = max(4, min(16, int(min(w, h) * 0.30)))
        sy0 = max(0, y - margin);  sy1 = min(H, y + h + margin)
        sx0 = max(0, x - margin);  sx1 = min(W, x + w + margin)
        surround = gray[sy0:sy1, sx0:sx1]
        surround_mean = float(np.mean(surround)) if surround.size else roi_mean
        darkness = max(0.0, (surround_mean - roi_mean) / (surround_mean + 1.0))
        if darkness < 0.05:
            continue

        # Composite confidence (three independent signals)
        conf = min(1.0,
            mar_fill   * 0.40 +
            rect_fill  * 0.25 +
            min(darkness * 1.75, 0.35)
        )
        if conf < 0.38:
            continue

        port_type = _classify_port_type(ar)
        cx_pct = round((x + w / 2) / W * 100, 1)
        cy_pct = round((y + h / 2) / H * 100, 1)

        candidates.append({
            'port_type': port_type,
            'pos_x': cx_pct,
            'pos_y': cy_pct,
            'confidence': round(conf, 2),
            '_ar': ar,
            '_darkness': darkness,   # used for texture tiebreak; removed before return
        })
        bboxes_px.append((w, h))

    if not candidates:
        return []

    # ── IQR-based size-consistency filter ─────────────────────────────────────
    # Ports on a device panel are all roughly the same size.  Use the
    # interquartile range (more robust than median × 4×) to remove outliers.
    if len(bboxes_px) >= 4:
        areas = [bw * bh for bw, bh in bboxes_px]
        s = sorted(areas)
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

    # ── Texture-based type refinement ─────────────────────────────────────────
    # In the ambiguous AR zone (0.90 – 1.50), the interior darkness score helps
    # distinguish SFP/SFP+ (metal cage → very dark) from RJ45 (plastic guide →
    # moderate darkness).  We only override when the signal is unambiguous.
    for c in candidates:
        ar_c = c.pop('_ar', 0.0)
        dk_c = c.pop('_darkness', 0.0)
        if 0.90 <= ar_c <= 1.50:
            if dk_c > 0.30 and ar_c < 1.30:
                # Significantly dark + not too wide → SFP-family metal cage
                c['port_type'] = 'SFP' if ar_c >= 1.00 else 'SFP+'
            elif dk_c < 0.18:
                # Low contrast interior → plastic insert → RJ45
                c['port_type'] = 'RJ45'

    # ── Asymmetric centroid NMS + cluster reclassification ────────────────────
    return _reclassify_by_cluster(
        _centroid_nms(candidates, x_thresh=3.0, y_thresh=5.0)
    )


# ── YOLO detection ─────────────────────────────────────────────────────────────

def _detect_with_yolo(image_path: str, model_path: str) -> list:
    """
    Run YOLOv8 inference with panorama-aware imgsz and tighter thresholds.

    Improvements over V1:
    • conf raised from 0.10 → 0.20 to reduce false positives.
    • iou set to 0.45 for stricter internal NMS on dense panels.
    • imgsz adapted to the image aspect ratio: very wide images (>3.5:1)
      use a (384 × 1280) rectangle instead of a square crop, which avoids
      losing ports in the resized lateral sections.
    • Asymmetric centroid NMS applied after YOLO to eliminate any residual
      duplicate detections.
    """
    from ultralytics import YOLO

    id_to_type = {cfg['class_id']: pt for pt, cfg in _PORT_CONFIG.items()}
    model = YOLO(model_path)

    # Detect aspect ratio to choose an appropriate inference resolution.
    imgsz = 640
    try:
        import cv2
        img_h = cv2.imread(image_path)
        if img_h is not None:
            H_i, W_i = img_h.shape[:2]
            if W_i / max(H_i, 1) > 3.5:
                imgsz = (384, 1280)   # wide-panel mode
            elif W_i > 900:
                imgsz = 1280
    except Exception:
        pass

    results = model.predict(
        image_path,
        verbose=False,
        conf=0.20,
        iou=0.45,
        imgsz=imgsz,
    )

    detections = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            cls_id = int(box.cls[0].item())
            port_type = id_to_type.get(cls_id, 'RJ45')
            norm = box.xywhn[0].tolist()   # [cx, cy, w, h] normalised 0–1
            cx_pct = round(norm[0] * 100, 1)
            cy_pct = round(norm[1] * 100, 1)
            conf = round(float(box.conf[0].item()), 2)
            detections.append({
                'port_type': port_type,
                'pos_x': cx_pct,
                'pos_y': cy_pct,
                'confidence': conf,
            })

    # Post-NMS with the same asymmetric thresholds, then cluster-level
    # majority-vote reclassification (same pipeline as the OpenCV path).
    return _reclassify_by_cluster(
        _centroid_nms(detections, x_thresh=3.0, y_thresh=5.0)
    )


# ── View ───────────────────────────────────────────────────────────────────────

class PortAnalyzeView(APIView):
    """
    POST /asset/port-analyze

    Body: { "image_path": "components/switch.jpg", "side": "front" }

    Returns a list of detected ports:
    [{ "port_type": "RJ45", "pos_x": 12.5, "pos_y": 45.0,
       "name": "GigabitEthernet0/0", "confidence": 0.82 }, ...]
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        image_path = request.data.get('image_path', '')
        side = request.data.get('side', 'front')

        if not _is_safe_relpath(image_path):
            return Response(
                {'error': 'Invalid image path.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        abs_image_path = os.path.join(_get_media_root(), image_path)
        if not os.path.isfile(abs_image_path):
            return Response(
                {'error': 'Image not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        model_path = os.path.join(_get_media_root(), 'models', 'port-yolo.pt')

        try:
            if os.path.isfile(model_path):
                ports = _detect_with_yolo(abs_image_path, model_path)
                # If the YOLO model (possibly freshly trained with few samples)
                # finds nothing, fall back to the OpenCV heuristic.
                if not ports:
                    ports = _detect_with_opencv(abs_image_path)
            else:
                ports = _detect_with_opencv(abs_image_path)
        except Exception:
            # Graceful fallback: if YOLO fails entirely, try OpenCV.
            try:
                ports = _detect_with_opencv(abs_image_path)
            except Exception:
                ports = []

        ports = _assign_names(ports)
        return Response(ports, status=status.HTTP_200_OK)
