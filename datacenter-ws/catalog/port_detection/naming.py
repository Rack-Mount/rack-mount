"""
Port naming: group detections by type and assign row-aware sequential names.
"""
from .constants import PORT_CONFIG, PORT_NAME_TEMPLATES


def classify_port_type(ar: float) -> str:
    """Map a bounding-box aspect ratio to the closest port type."""
    for pt, cfg in PORT_CONFIG.items():
        if cfg['ar_min'] <= ar < cfg['ar_max']:
            return pt
    return 'RJ45'


def _name_group(items: list, template: str) -> None:
    """
    Sort one port-type group into rows and assign sequential names.

    Row detection: sort ports by Y; a new row starts when the gap between
    consecutive Y values exceeds ``max(8 %, 2 × median_gap)``.  Within each
    row, ports are sorted left-to-right.  The counter is sequential across
    rows (top-to-bottom, left-to-right).
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


def assign_names(ports: list) -> list:
    """
    Group *ports* by type and assign row-aware sequential names to each group.

    Each port type is numbered independently starting from 0, so an SFP port
    counter never collides with an RJ45 counter on a mixed panel.

    Returns the same list (mutated in-place) for convenience.
    """
    by_type: dict = {}
    for p in ports:
        by_type.setdefault(p['port_type'], []).append(p)
    for pt, items in by_type.items():
        _name_group(items, PORT_NAME_TEMPLATES.get(pt, '{}'))
    return ports
