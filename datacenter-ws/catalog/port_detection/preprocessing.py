"""
Image preprocessing for YOLO inference.

The two functions here are applied to every equipment photo before any
inference step, both in the batch pipeline (PortAnalyzeView) and the
single-click pipeline (PortClickAnalyzeView).
"""


def preprocess_for_inference(img):
    """
    Enhance an equipment panel photo for YOLO inference.

    Two-stage pipeline:

    1. **CLAHE on the L channel** (LAB colour space) – boosts local contrast
       on dark server bezels and overexposed rack backgrounds without shifting
       colour hue.  ``clipLimit=2.0`` is conservative: enough to lift dark
       port cavities but not so aggressive it introduces false edges on smooth
       panels.

    2. **Unsharp mask** (amount 0.4, sigma 1.5) – recovers edge sharpness
       lost to camera optics, motion blur, or JPEG compression, making
       rectangular port-opening silhouettes crisper for the CNN decoder.

    Parameters
    ----------
    img:
        BGR image as a NumPy array (uint8, H × W × 3).

    Returns
    -------
    numpy.ndarray
        Enhanced BGR image with the same shape and dtype.
    """
    import cv2

    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)

    # sharpened = original + 0.4 × (original − blurred)
    blur = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=1.5)
    return cv2.addWeighted(enhanced, 1.4, blur, -0.4, 0)


def auto_canny(gray):
    """
    Compute adaptive Canny edge thresholds from the image median intensity.

    The "sigma method": lo = (1 − σ) × median, hi = (1 + σ) × median, with
    σ = 0.33.  Performs far better than fixed thresholds across the wide
    range of exposure levels found in equipment photographs.

    Parameters
    ----------
    gray:
        Single-channel (grayscale) uint8 image.

    Returns
    -------
    numpy.ndarray
        Binary edge image.
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
