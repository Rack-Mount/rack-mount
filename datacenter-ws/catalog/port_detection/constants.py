"""
Port detection – shared constants.

All mappings between port types, YOLO class IDs, bounding-box sizes and
name templates live here so that the detection, correction and training
pipelines stay in sync.

Rule of thumb
─────────────
• If you add a new port type, update EACH of the dicts below.
• _YOLO_ID_TO_TYPE and _PORT_CLASS_ID MUST be mirrors of each other and
  of the class list in train_port_detector.py.
"""

# ── Aspect-ratio → port type (OpenCV classification path) ─────────────────────
# AR = bounding-box width / height, measured on the working image.
# Boundaries are calibrated on real equipment front-panel photographs.
# The cluster-based reclassification (nms.reclassify_by_cluster) acts as a
# second line of defence for edge cases that straddle any single boundary.
PORT_CONFIG = {
    'LC':     {'ar_min': 0.00, 'ar_max': 0.80, 'class_id': 5},
    'SFP+':   {'ar_min': 0.80, 'ar_max': 1.00, 'class_id': 2},
    'SFP':    {'ar_min': 1.00, 'ar_max': 1.20, 'class_id': 1},
    # Upper bound lowered from 1.35: dense 48-port RJ45 panels have AR ~1.10-1.30.
    'RJ45':   {'ar_min': 1.20, 'ar_max': 2.00, 'class_id': 0},
    'USB-A':  {'ar_min': 2.00, 'ar_max': 2.90, 'class_id': 3},
    'SERIAL': {'ar_min': 2.90, 'ar_max': 99.0, 'class_id': 4},
}

# Simple list of (ar_min, ar_max, type) tuples for the click-detection path.
AR_RANGES = [
    (0.00, 0.80, 'LC'),
    (0.80, 1.00, 'SFP+'),
    (1.00, 1.20, 'SFP'),
    (1.20, 2.00, 'RJ45'),
    (2.00, 2.90, 'USB-A'),
    (2.90, 99.0, 'SERIAL'),
]

# ── Sequential name templates per type ────────────────────────────────────────
# Give distinct prefixes so mixed panels (e.g. SFP + SFP+) produce unique names.
PORT_NAME_TEMPLATES = {
    'RJ45':   'GigabitEthernet0/{}',
    'SFP':    'TenGigabitEthernet0/{}',
    'SFP+':   'TwentyFiveGigE0/{}',
    'QSFP+':  'FortyGigabitEthernet0/{}',
    'USB-A':  'USB{}',
    'SERIAL': 'Serial0/{}',
    'LC':     'LC{}',
}

# ── YOLO class-ID ↔ port type ──────────────────────────────────────────────────
# MUST stay in sync with PORT_CLASS_ID below and with train_port_detector.py.
#   0=RJ45, 1=SFP family, 2=QSFP family, 3=USB, 4=SERIAL, 5=LC/fibre
YOLO_ID_TO_TYPE = {
    0: 'RJ45',
    1: 'SFP',    # covers SFP / SFP+ / SFP28 (visually identical cage)
    2: 'QSFP+',  # covers QSFP+ / QSFP28 / QSFP-DD
    3: 'USB-A',
    4: 'SERIAL',
    5: 'LC',
}

# Reverse mapping: port type → YOLO class-ID (used when writing training labels).
PORT_CLASS_ID = {
    'RJ45': 0, 'MGMT': 0,
    'SFP': 1, 'SFP+': 1, 'SFP28': 1,
    'QSFP+': 2, 'QSFP28': 2, 'QSFP-DD': 2,
    'USB-A': 3, 'USB-C': 3,
    'SERIAL': 4,
    'LC': 5, 'SC': 5, 'FC': 5,
}

# Class names list for YOLO training (index = class-ID value).
CLASS_NAMES = ['RJ45', 'SFP/SFP+', 'QSFP', 'USB', 'SERIAL', 'LC']

# ── Default bounding-box sizes (% of image) for IoU NMS ──────────────────────
# Used when a detection does not carry an explicit bbox size.
DEFAULT_BW = {'RJ45': 4.5, 'SFP': 3.0, 'SFP+': 3.0,
              'USB-A': 4.0, 'SERIAL': 6.0, 'LC': 3.5}
DEFAULT_BH = {'RJ45': 5.5, 'SFP': 5.0, 'SFP+': 5.0,
              'USB-A': 4.5, 'SERIAL': 4.0, 'LC': 6.0}

# ── Bounding-box sizes (fraction of image) for YOLO training labels ───────────
PORT_BW = {
    'RJ45': 0.055, 'MGMT': 0.055,
    'SFP': 0.030, 'SFP+': 0.030, 'SFP28': 0.030,
    'QSFP+': 0.045, 'QSFP28': 0.045, 'QSFP-DD': 0.045,
    'USB-A': 0.040, 'USB-C': 0.040,
    'SERIAL': 0.060,
    'LC': 0.035, 'SC': 0.035, 'FC': 0.035,
}
PORT_BH = {
    'RJ45': 0.060, 'MGMT': 0.060,
    'SFP': 0.048, 'SFP+': 0.048, 'SFP28': 0.048,
    'QSFP+': 0.052, 'QSFP28': 0.052, 'QSFP-DD': 0.052,
    'USB-A': 0.045, 'USB-C': 0.045,
    'SERIAL': 0.040,
    'LC': 0.060, 'SC': 0.060, 'FC': 0.060,
}

# Class-ID–indexed variants (for code paths that work with numeric class IDs).
PORT_BW_BY_ID = {0: 0.055, 1: 0.030, 2: 0.045, 3: 0.040, 4: 0.060, 5: 0.035}
PORT_BH_BY_ID = {0: 0.060, 1: 0.048, 2: 0.052, 3: 0.045, 4: 0.040, 5: 0.060}

# ── Physical port sizes in mm (real-world approximate dimensions) ─────────────
# Used when the AssetModel carries width_mm / height_mm to derive bbox fractions
# from actual measurements.  Falls back to PORT_BW_BY_ID / PORT_BH_BY_ID.
PORT_W_MM = {0: 14.0, 1: 9.0, 2: 14.0, 3: 12.0, 4: 35.0, 5: 12.0}
PORT_H_MM = {0: 14.0, 1: 13.0, 2: 14.0, 3: 5.0,  4: 14.0, 5: 14.0}
