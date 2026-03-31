"""
OCR-based port label reading using EasyOCR.

:func:`read_label_ocr` is the single entry point: it accepts an absolute
image path and a click position and returns the most likely port-label
string (or *None* if nothing credible is found).

The reader is initialised lazily and cached in a module-level singleton so it
is not re-created on every request.
"""
import re

_ocr_reader = None

# Pattern: recognisable port-label formats (numeric, interface notation, etc.)
_PORT_NAME_RE = re.compile(
    r'^('
    r'\d{1,3}'                              # "1", "24", "48"
    r'|[A-Za-z]{1,4}\d+([/\-]\d+)*'        # "Gi0/1", "Te1/0/1", "eth0", "GE1"
    r'|[A-Za-z]{1,6}\s?\d+([/\-]\d+)*'     # "Port 1", "SFP1"
    r')$',
    re.IGNORECASE,
)


def _get_ocr_reader():
    """Return a cached EasyOCR reader (initialised once per process)."""
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _ocr_reader


def is_port_name(text: str) -> bool:
    """True if *text* looks like a real port label (number or interface name)."""
    text = text.strip()
    if not text or len(text) > 16:
        return False
    return bool(_PORT_NAME_RE.match(text))


def _ocr_on_image(reader, ocr_img, cx: float, cy: float):
    """
    Run EasyOCR on *ocr_img* and return ``(text, score)`` for the best match.

    Score = confidence × proximity_weight + pattern_bonus.
    Proximity is normalised to the larger image dimension so text near the
    click point is preferred.  A +0.15 bonus is given for text that matches
    the port-name pattern.
    """
    h, w = ocr_img.shape[:2]
    max_dist = max(w, h) * 0.70
    results = reader.readtext(ocr_img, detail=1, paragraph=False)
    best, best_score = None, -1.0
    for bbox, text, conf in results:
        text = text.strip()
        if not text:
            continue
        bx = (bbox[0][0] + bbox[2][0]) / 2
        by = (bbox[0][1] + bbox[2][1]) / 2
        dist = ((bx - cx) ** 2 + (by - cy) ** 2) ** 0.5
        proximity = max(0.0, 1.0 - dist / max_dist)
        pattern_bonus = 0.15 if is_port_name(text) else 0.0
        score = conf * (0.35 + 0.65 * proximity) + pattern_bonus
        if score > best_score:
            best_score = score
            best = (text, score)
    return best


def read_label_ocr(abs_path: str, click_x: float, click_y: float):
    """
    Attempt to read the port label near the click point using three strategies.

    Strategies (highest score wins):
    1. CLAHE grayscale upscaled – improves low-contrast text.
    2. Inverted image upscaled – catches white-on-dark labels.
    3. Denoised grayscale upscaled – baseline.

    Parameters
    ----------
    abs_path:
        Absolute filesystem path to the image.
    click_x / click_y:
        Click position as percentages (0–100).

    Returns
    -------
    str | None
        The recognised label text, or *None* if nothing credible was found.
    """
    try:
        import cv2

        img = cv2.imread(abs_path)
        if img is None:
            return None

        from .click_detector import _crop_around_click
        # Slightly larger crop to capture labels at the edges of the port opening.
        crop_raw, _, _, crop_cx_raw, crop_cy_raw = _crop_around_click(
            img, click_x, click_y, pad_pct=0.18)
        if crop_raw.size == 0:
            return None

        reader = _get_ocr_reader()

        def _upscale_gray(gray_img, min_w=650):
            h, w = gray_img.shape[:2]
            scale = max(1.0, min_w / w)
            if scale > 1.0:
                gray_img = cv2.resize(
                    gray_img,
                    (int(w * scale), int(h * scale)),
                    interpolation=cv2.INTER_CUBIC,
                )
            return gray_img, scale

        def _to_bgr(gray_img):
            return cv2.cvtColor(gray_img, cv2.COLOR_GRAY2BGR)

        # ── Strategy 1: CLAHE grayscale ──────────────────────────────────────
        gray = cv2.cvtColor(crop_raw, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
        gray_cl = clahe.apply(gray)
        gray_cl, scale1 = _upscale_gray(gray_cl)
        r1 = _ocr_on_image(reader, _to_bgr(gray_cl),
                           crop_cx_raw * scale1, crop_cy_raw * scale1)

        # ── Strategy 2: inverted (white text on dark background) ─────────────
        gray_inv = cv2.bitwise_not(gray_cl)
        r2 = _ocr_on_image(reader, _to_bgr(gray_inv),
                           crop_cx_raw * scale1, crop_cy_raw * scale1)

        # ── Strategy 3: denoised grayscale ───────────────────────────────────
        gray_dn = cv2.fastNlMeansDenoising(gray, h=7)
        gray_dn, scale3 = _upscale_gray(gray_dn)
        r3 = _ocr_on_image(reader, _to_bgr(gray_dn),
                           crop_cx_raw * scale3, crop_cy_raw * scale3)

        candidates = [r for r in (r1, r2, r3) if r is not None]
        if not candidates:
            return None

        best_text, best_score = max(candidates, key=lambda r: r[1])

        # Lower threshold when the text matches a known port-name pattern.
        threshold = 0.10 if is_port_name(best_text) else 0.18
        return best_text if best_score > threshold else None

    except Exception:
        return None
