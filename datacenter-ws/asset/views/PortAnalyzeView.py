import os

from django.conf import settings
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import PortAnalysisThrottle

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
    # lowered from 1.35
    'RJ45':   {'ar_min': 1.20, 'ar_max': 2.00, 'class_id': 0},
    'USB-A':  {'ar_min': 2.00, 'ar_max': 2.90, 'class_id': 3},
    'SERIAL': {'ar_min': 2.90, 'ar_max': 99.0, 'class_id': 4},
}

# Templates give distinct prefixes per type so mixed panels don't produce
# colliding names (SFP and SFP+ used to share the same template).
_PORT_NAME_TEMPLATES = {
    'RJ45':   'GigabitEthernet0/{}',
    'SFP':    'TenGigabitEthernet0/{}',
    'SFP+':   'TwentyFiveGigE0/{}',
    'QSFP+':  'FortyGigabitEthernet0/{}',
    'USB-A':  'USB{}',
    'SERIAL': 'Serial0/{}',
    'LC':     'LC{}',
}

# Explicit YOLO class-ID → port-type mapping.
# MUST stay in sync with PORT_CLASS_ID in train_port_detector.py:
#   0=RJ45, 1=SFP/SFP+/SFP28 (same cage), 2=QSFP+/28/DD, 3=USB, 4=SERIAL, 5=LC
# Do NOT rebuild this from _PORT_CONFIG: that dict uses AR-based class IDs
# intended for the OpenCV path, not for the YOLO model.
_YOLO_ID_TO_TYPE = {
    0: 'RJ45',
    1: 'SFP',    # covers SFP / SFP+ / SFP28 (visually identical cage)
    2: 'QSFP+',  # covers QSFP+ / QSFP28 / QSFP-DD
    3: 'USB-A',
    4: 'SERIAL',
    5: 'LC',
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


# Per-type default box sizes (% of image) used when explicit size is missing.
_DEFAULT_BW = {'RJ45': 4.5, 'SFP': 3.0, 'SFP+': 3.0,
               'USB-A': 4.0, 'SERIAL': 6.0, 'LC': 3.5}
_DEFAULT_BH = {'RJ45': 5.5, 'SFP': 5.0, 'SFP+': 5.0,
               'USB-A': 4.5, 'SERIAL': 4.0, 'LC': 6.0}


def _bbox_nms(candidates: list, iou_thresh: float = 0.30,
              max_det: int = 96) -> list:
    """
    IoU-based NMS for port detections.

    More robust than centroid-distance NMS: uses the actual bounding-box
    overlap ratio, so a small inner contour produced by the same port hole as
    a larger outer contour (which fooled the old fixed-distance check) is
    correctly suppressed.

    iou_thresh=0.30 is intentionally lower than YOLO's default 0.45 to
    aggressively collapse near-duplicate detections.

    Candidates may carry '_bw_pct' / '_bh_pct' (bbox size in % of image);
    falls back to per-type defaults when those fields are absent.
    The temporary size fields are stripped before returning.
    """
    if not candidates:
        return candidates

    ordered = sorted(candidates, key=lambda c: c['confidence'], reverse=True)
    final: list = []

    for c in ordered:
        cx, cy = c['pos_x'], c['pos_y']
        pt = c.get('port_type', 'RJ45')
        bw = c.get('_bw_pct', _DEFAULT_BW.get(pt, 4.0))
        bh = c.get('_bh_pct', _DEFAULT_BH.get(pt, 5.0))
        x1, y1, x2, y2 = cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2

        overlaps = False
        for f in final:
            fx, fy = f['pos_x'], f['pos_y']
            fpt = f.get('port_type', 'RJ45')
            fbw = f.get('_bw_pct', _DEFAULT_BW.get(fpt, 4.0))
            fbh = f.get('_bh_pct', _DEFAULT_BH.get(fpt, 5.0))
            fx1, fy1 = fx - fbw / 2, fy - fbh / 2
            fx2, fy2 = fx + fbw / 2, fy + fbh / 2

            ix1 = max(x1, fx1)
            iy1 = max(y1, fy1)
            ix2 = min(x2, fx2)
            iy2 = min(y2, fy2)
            if ix2 <= ix1 or iy2 <= iy1:
                continue
            inter = (ix2 - ix1) * (iy2 - iy1)
            union = bw * bh + fbw * fbh - inter
            iou = inter / union if union > 0 else 0.0
            # IoMin (containment ratio): intersection / area of the SMALLER box.
            # When YOLO fires twice for the same port opening (once on the outer
            # cage bbox, once on the inner socket void), the two boxes share the
            # same centre but differ in size → IoU is low (~0.25) and both
            # survive pure IoU NMS.  IoMin = intersection / min_area ≈ 1.0 for
            # a fully-contained inner box, reliably suppressing the duplicate.
            min_area = min(bw * bh, fbw * fbh)
            iomin = inter / min_area if min_area > 0 else 0.0
            if iou > iou_thresh or iomin > 0.60:
                overlaps = True
                break

        if not overlaps:
            final.append(c)
        if len(final) >= max_det:
            break

    for c in final:
        c.pop('_bw_pct', None)
        c.pop('_bh_pct', None)
    return final


def _deduplicate_by_grid(detections: list) -> list:
    """
    Row-level duplicate removal based on regular port-grid spacing.

    Within each detected horizontal row, any port whose X centre is closer
    than half the median inter-port X gap to an already-accepted port is
    treated as a duplicate and removed (lowest confidence wins suppression).

    This catches the residual near-duplicate contours that survive IoU NMS
    because the inner and outer frame of the same port hole don't overlap
    enough to exceed the IoU threshold.
    """
    if len(detections) < 3:
        return detections

    by_y = sorted(detections, key=lambda c: c['pos_y'])
    y_vals = [c['pos_y'] for c in by_y]
    gaps = [y_vals[i + 1] - y_vals[i] for i in range(len(y_vals) - 1)]
    median_gap = sorted(gaps)[len(gaps) // 2] if gaps else 1.0
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

    keep: set = set()
    for row in rows:
        row_x = sorted(row, key=lambda c: c['pos_x'])
        if len(row_x) < 2:
            keep.update(id(c) for c in row_x)
            continue

        xs = [c['pos_x'] for c in row_x]
        x_gaps = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)]
        med_xg = sorted(x_gaps)[len(x_gaps) // 2]
        min_dist = max(0.5, med_xg * 0.5)   # min tolerated gap between ports

        # Greedy: highest confidence first; accept only if far enough from
        # every already-accepted port in this row.
        kept: list = []
        for c in sorted(row_x, key=lambda c: c['confidence'], reverse=True):
            if not any(abs(c['pos_x'] - k['pos_x']) < min_dist for k in kept):
                kept.append(c)
        keep.update(id(c) for c in kept)

    return [c for c in detections if id(c) in keep]


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
            type_counts[c['port_type']] = type_counts.get(
                c['port_type'], 0) + 1

        dominant = max(type_counts, key=lambda t: type_counts[t])
        if type_counts[dominant] / len(row) >= 0.65:
            for c in row:
                c['port_type'] = dominant

    return detections


# ── Image preprocessing & inference helpers ────────────────────────────────────

def _preprocess_for_inference(img):
    """
    Enhance an equipment panel photo for YOLO inference:

    1. CLAHE on the L channel (LAB colour space) – boosts local contrast on
       dark server bezels and overexposed rack backgrounds, without shifting
       hue.  clipLimit=2.0 is conservative: enough to lift dark port cavities
       but not so aggressive it introduces false edges on smooth panels.
    2. Unsharp mask (amount=0.4, sigma=1.5) – recovers edge sharpness lost to
       camera optics, motion blur, or JPEG compression, making the rectangular
       port-opening silhouettes crisper for the CNN decoder.

    Returns the enhanced BGR image (same shape / dtype).
    """
    import cv2
    import numpy as np

    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)

    # Unsharp mask: sharpened = original + 0.4 × (original − blurred)
    blur = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=1.5)
    sharpened = cv2.addWeighted(enhanced, 1.4, blur, -0.4, 0)
    return sharpened


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

    # CLAHE: normalises local contrast so both under-exposed (dark 1U server)
    # and over-exposed (bright flash) photos yield well-defined port silhouettes.
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Bilateral filter preserves edges much better than Gaussian; this reduces
    # false contours along textured bezels.
    blurred = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

    # Adaptive Canny + dilation + morphological close
    edges = _auto_canny(blurred)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)
    # Morphological close: reconnects hair-line gaps in port-frame outlines
    # caused by bezel reflections, worn surface coatings, or JPEG ringing.
    # A single iteration is enough without bloating the contour shape.
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=1)

    # RETR_CCOMP returns both external contours and holes, so we catch port
    # openings that sit inside a larger bezel frame.
    contours, _ = cv2.findContours(
        edges, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

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
        sy0 = max(0, y - margin)
        sy1 = min(H, y + h + margin)
        sx0 = max(0, x - margin)
        sx1 = min(W, x + w + margin)
        surround = gray[sy0:sy1, sx0:sx1]
        surround_mean = float(np.mean(surround)) if surround.size else roi_mean
        darkness = max(0.0, (surround_mean - roi_mean) / (surround_mean + 1.0))
        if darkness < 0.05:
            continue

        # Composite confidence (three independent signals)
        conf = min(1.0,
                   mar_fill * 0.40 +
                   rect_fill * 0.25 +
                   min(darkness * 1.75, 0.35)
                   )
        if conf < 0.38:
            continue

        port_type = _classify_port_type(ar)

        # Portrait USB-A: connector mounted vertically (cable plugs in from
        # top/bottom), so the opening is taller than wide (ar < 0.55).
        # LC fibre cages are small → bbox area < 0.2 % of image;
        # a USB-A opening is physically larger → bbox area > 0.2 %.
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
            '_darkness': darkness,   # used for texture tiebreak; removed before return
            '_bw_pct': round(w / W * 100, 2),   # bbox size for IoU NMS
            '_bh_pct': round(h / H * 100, 2),
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

    # ── IoU NMS → grid deduplication → cluster reclassification ──────────────
    return _reclassify_by_cluster(
        _deduplicate_by_grid(
            _bbox_nms(candidates)
        )
    )


# ── YOLO detection ─────────────────────────────────────────────────────────────

def _grid_dedup(detections: list) -> list:
    """
    Eliminate duplicate detections by snapping raw YOLO outputs onto the
    physical port grid — one detection per grid cell (column × row).

    Root cause of duplicates
    ────────────────────────
    YOLO fires multiple times per physical port: once on the outer metal-cage
    frame (larger bbox) and once on the inner socket void (smaller bbox,
    identical X centre, 2–5 % lower Y centre).  Their IoU ≈ 0.15–0.25, well
    below any practical NMS threshold, so both survive standard post-processing.

    Why column-first works
    ──────────────────────
    The outer-cage and inner-void detections of the SAME port share an
    identical X centre (manufacturing tolerance < 0.3 %).  Grouping by X
    first therefore collapses ALL within-port duplicates in a single pass,
    regardless of their Y offset.

    Algorithm
    ─────────
    Pass 1 — X-column grouping:
        Sort detections by X.  Estimate the column pitch as the median of
        consecutive X gaps that exceed a 0.3 % noise floor.  Each new column
        starts when the consecutive X gap ≥ col_pitch × 0.45 (i.e. less than
        half the pitch away means the same slot).

    Pass 2 — Y-row grouping within each column:
        Sort column members by Y.  A new row starts when the Y gap exceeds
        _Y_ROW_SPLIT (8 %).  This is deliberately set above the typical
        outer/inner Y offset (2–5 %) and below any realistic row-to-row
        spacing: panels with 4 rows have ≥ 10 % row spacing; 2-row panels
        have ≥ 30 %.

    Keep the highest-confidence detection per (column, row) cell.
    """
    _Y_ROW_SPLIT = 8.0   # % of image height; must be > inner/outer Y offset
    # and < minimum row-to-row spacing on real hardware.

    if len(detections) < 2:
        return list(detections)

    # ── Pass 1: group by X into columns ────────────────────────────────────────
    ordered_x = sorted(detections, key=lambda d: d['pos_x'])
    xs = [d['pos_x'] for d in ordered_x]
    x_gaps = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)]

    # Median of significant X gaps = column pitch.
    # Near-zero gaps (same-port duplicates) are filtered by the 0.3 % floor
    # so they don't drag the median downward.
    sig_gaps = sorted(g for g in x_gaps if g > 0.3)
    if sig_gaps:
        col_pitch = sig_gaps[len(sig_gaps) // 2]
    else:
        col_pitch = 100.0   # single-column panel

    eps_x = max(0.5, col_pitch * 0.45)

    columns: list = [[ordered_x[0]]]
    for i, det in enumerate(ordered_x[1:], start=1):
        # x_gaps[i-1] is the gap between ordered_x[i-1] and ordered_x[i]
        if x_gaps[i - 1] < eps_x:
            columns[-1].append(det)
        else:
            columns.append([det])

    # ── Pass 2: within each column group by Y into rows ─────────────────────
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
    """Convert ultralytics Results to the internal detection dict format."""
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


def _detect_with_yolo(image_path: str, model_path: str) -> list:
    """
    Run YOLOv8 inference and return exactly one detection per physical port.

    Pipeline
    ────────
    1. CLAHE + unsharp-mask preprocessing  → sharper port features.
    2. Single full-image pass at imgsz=1280, conf=0.25, iou=0.30.
       Low confidence threshold catches all genuine ports; _grid_dedup
       collapses the resulting duplicates.
    3. _grid_dedup  → one detection per (column, row) grid cell.
       Handles YOLO's outer-cage + inner-void double-fire by exploiting
       the physical invariant that duplicate detections share an identical
       X centre (same port slot).  See _grid_dedup docstring for details.
    4. _bbox_nms    → IoU / IoMin safety net for any residual overlapping
       detections that slipped past the grid algorithm.
    5. _reclassify_by_cluster → row-majority-vote type correction.
    """
    import tempfile
    from ultralytics import YOLO

    model = YOLO(model_path)

    # ── Load & preprocess ─────────────────────────────────────────────────────
    img_orig = None
    preprocessed_path = None
    infer_path = image_path

    try:
        import cv2
        img_orig = cv2.imread(image_path)
        if img_orig is not None:
            enhanced = _preprocess_for_inference(img_orig)
            tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
            tmp.close()
            preprocessed_path = tmp.name
            cv2.imwrite(preprocessed_path, enhanced,
                        [cv2.IMWRITE_JPEG_QUALITY, 95])
            infer_path = preprocessed_path
    except Exception:
        pass

    # Use 1280 for any image larger than 640 px. Dense 48-port panels
    # photographed at typical resolution have port widths of only 20–30 px
    # at 640; 1280 doubles that to 40–60 px, well within model training range.
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
                conf=0.25,           # permissive: _grid_dedup handles dupes
                iou=0.30,            # tighter YOLO NMS to drop high-overlap anchors
                agnostic_nms=True,   # collapse cross-class overlaps inside YOLO
                imgsz=imgsz,
                max_det=512,
            ),
            _YOLO_ID_TO_TYPE,
        )
    finally:
        if preprocessed_path:
            try:
                os.remove(preprocessed_path)
            except OSError:
                pass

    # Three-stage post-processing pipeline:
    #   1. _grid_dedup           → one detection per (column × row) cell
    #   2. _bbox_nms             → IoU / IoMin safety net
    #   3. _reclassify_by_cluster → row-majority-vote type correction
    return _reclassify_by_cluster(
        _bbox_nms(
            _grid_dedup(raw)
        )
    )


# ── View ───────────────────────────────────────────────────────────────────────

class PortAnalyzeView(APIView):
    """
    POST /asset/port-analyze

    Body: { "image_path": "components/switch.jpg", "side": "front" }

    Returns a list of detected ports:
    [{ "port_type": "RJ45", "pos_x": 12.5, "pos_y": 45.0,
       "name": "GigabitEthernet0/0", "confidence": 0.82 }, ...]

    **Rate Limit**: 100 analyses per hour per user (prevents inference spam).
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [PortAnalysisThrottle]

    @extend_schema(
        request=inline_serializer(
            name='PortAnalyzeRequest',
            fields={
                'image_path': serializers.CharField(),
                'side': serializers.CharField(default='front'),
            },
        ),
        responses={
            200: inline_serializer(
                name='PortAnalyzeResult',
                fields={
                    'port_type': serializers.CharField(),
                    'pos_x': serializers.FloatField(),
                    'pos_y': serializers.FloatField(),
                    'name': serializers.CharField(),
                    'confidence': serializers.FloatField(),
                },
                many=True,
            )
        },
    )
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
                if not ports:
                    # YOLO returned nothing (model not yet trained, fresh
                    # install, or completely unrecognisable panel orientation):
                    # fall back to the OpenCV heuristic.
                    ports = _detect_with_opencv(abs_image_path)
            else:
                ports = _detect_with_opencv(abs_image_path)
        except Exception:
            # If YOLO crashes (missing dependency, corrupt model, etc.),
            # OpenCV still gives a usable result.
            try:
                ports = _detect_with_opencv(abs_image_path)
            except Exception:
                ports = []

        ports = _assign_names(ports)
        return Response(ports, status=status.HTTP_200_OK)
