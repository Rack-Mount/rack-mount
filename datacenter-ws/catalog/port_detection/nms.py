"""
Non-maximum suppression and deduplication for port detections.

Three complementary algorithms handle duplicate/near-duplicate detections:

1. :func:`bbox_nms`  – IoU + IoMin NMS; primary suppression step.
2. :func:`deduplicate_by_grid` – row-level grid deduplication; catches
   residual near-duplicates that survive NMS because their IoU is too low.
3. :func:`reclassify_by_cluster` – row-majority-vote type correction;
   fixes isolated misclassifications caused by ambiguous aspect ratios.
"""
from .constants import DEFAULT_BW, DEFAULT_BH


def bbox_nms(candidates: list, iou_thresh: float = 0.30,
             max_det: int = 96) -> list:
    """
    IoU-based NMS for port detections.

    More robust than centroid-distance NMS: uses the actual bounding-box
    overlap ratio, so a small inner contour produced by the same port hole as
    a larger outer contour is correctly suppressed.

    ``iou_thresh=0.30`` is intentionally lower than YOLO's default 0.45 to
    aggressively collapse near-duplicate detections.

    IoMin (containment ratio)
    ─────────────────────────
    ``intersection / area_of_smaller_box``.  When YOLO fires twice for the
    same port (outer cage + inner socket void), the two boxes share the same
    centre but differ in size → IoU ≈ 0.25 (below NMS threshold) but
    IoMin ≈ 1.0 (fully contained) → the duplicate is reliably suppressed.

    NB: The temporary ``_bw_pct`` / ``_bh_pct`` size fields are stripped
    from the surviving detections before returning.
    """
    if not candidates:
        return candidates

    ordered = sorted(candidates, key=lambda c: c['confidence'], reverse=True)
    final: list = []

    for c in ordered:
        cx, cy = c['pos_x'], c['pos_y']
        pt = c.get('port_type', 'RJ45')
        bw = c.get('_bw_pct', DEFAULT_BW.get(pt, 4.0))
        bh = c.get('_bh_pct', DEFAULT_BH.get(pt, 5.0))
        x1, y1, x2, y2 = cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2

        overlaps = False
        for f in final:
            fx, fy = f['pos_x'], f['pos_y']
            fpt = f.get('port_type', 'RJ45')
            fbw = f.get('_bw_pct', DEFAULT_BW.get(fpt, 4.0))
            fbh = f.get('_bh_pct', DEFAULT_BH.get(fpt, 5.0))
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


def deduplicate_by_grid(detections: list) -> list:
    """
    Row-level duplicate removal based on regular port-grid spacing.

    Within each detected horizontal row, any port whose X centre is closer
    than half the median inter-port X gap to an already-accepted port is
    treated as a duplicate and discarded (lowest confidence is suppressed).

    This catches residual near-duplicate contours that survive IoU NMS
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
        min_dist = max(0.5, med_xg * 0.5)

        # Greedy: accept highest-confidence port first; skip if too close to any
        # already-accepted port in this row.
        kept: list = []
        for c in sorted(row_x, key=lambda c: c['confidence'], reverse=True):
            if not any(abs(c['pos_x'] - k['pos_x']) < min_dist for k in kept):
                kept.append(c)
        keep.update(id(c) for c in kept)

    return [c for c in detections if id(c) in keep]


def reclassify_by_cluster(detections: list) -> list:
    """
    Context-aware port type correction via row clustering and majority vote.

    On a real equipment panel, all ports in a physical row share the same
    connector type.  Occasional outliers (e.g. an RJ45 whose contour yielded
    an AR just below the SFP boundary) are corrected by checking what the
    majority of the row is classified as.

    Algorithm
    ─────────
    1. Cluster detections into horizontal rows (same gap-threshold as
       ``deduplicate_by_grid``).
    2. For each row with ≥ 4 ports, measure X-spacing uniformity
       (coefficient of variation ≤ 35 %).  Non-uniform rows (mixed sections)
       are skipped.
    3. If ≥ 65 % of ports in a uniform row share one type, reassign ALL
       ports in that row to the dominant type.
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
            continue  # degenerate: all ports at same X position
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
