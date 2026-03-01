"""
image_processing.py — server-side image transforms applied via Pillow.

Transform pipeline (in order):
  1. Perspective warp  — 4 source quad points → image rectangle
  2. Crop              — x, y, w, h (on perspective-warped image, in px)
  3. Rotation          — 0 | 90 | 180 | 270 ° (counter-clockwise)
  4. Flip              — flipH (horizontal mirror), flipV (vertical mirror)

params dict schema (all keys optional):
  {
    "perspective": [[x0,y0],[x1,y1],[x2,y2],[x3,y3]],  // source quad corners TL,TR,BR,BL
    "crop":        {"x": int, "y": int, "w": int, "h": int},
    "rotation":    0 | 90 | 180 | 270,
    "flipH":       bool,
    "flipV":       bool
  }

Points in "perspective" are given in the coordinate space of the ORIGINAL image
(before any crop), with TL=(0,0) at the original top-left.
"""

from __future__ import annotations

import io
import json
import math
from typing import Any

from django.core.files.uploadedfile import InMemoryUploadedFile
from PIL import Image


# ─────────────────────────────────────────────────────────────────────────────
# Perspective helpers
# ─────────────────────────────────────────────────────────────────────────────

def _solve_perspective_coeffs(src: list[list[float]], dst: list[list[float]]) -> list[float]:
    """
    Solve the 8 perspective-transform coefficients given 4 src→dst point pairs.

    Pillow's Image.transform(PERSPECTIVE) uses a **backward** (output→input) mapping:
        x_in = (a * x_out + b * y_out + c) / (g * x_out + h * y_out + 1)
        y_in = (d * x_out + e * y_out + f) / (g * x_out + h * y_out + 1)

    `src[i]`  = output pixel coordinate  (x_out, y_out)
    `dst[i]`  = input  pixel coordinate  (x_in,  y_in)

    Returns [a, b, c, d, e, f, g, h].
    """
    # Build 8×8 matrix A and right-hand side vector b from the 4 point pairs.
    # For each pair:
    #   a*x_out + b*y_out + c - g*x_in*x_out - h*x_in*y_out = x_in
    #   d*x_out + e*y_out + f - g*y_in*x_out - h*y_in*y_out = y_in
    matrix: list[list[float]] = []
    rhs: list[float] = []

    for (xo, yo), (xi, yi) in zip(src, dst):
        matrix.append([xo, yo, 1, 0,  0,  0, -xi * xo, -xi * yo])
        rhs.append(xi)
        matrix.append([0,  0,  0, xo, yo, 1, -yi * xo, -yi * yo])
        rhs.append(yi)

    # Gaussian elimination with partial pivoting
    n = 8
    aug = [row + [rhs[i]] for i, row in enumerate(matrix)]

    for col in range(n):
        # Find pivot
        pivot = max(range(col, n), key=lambda r: abs(aug[r][col]))
        aug[col], aug[pivot] = aug[pivot], aug[col]

        if abs(aug[col][col]) < 1e-12:
            raise ValueError(
                "Degenerate perspective transform (colinear or coincident points).")

        denom = aug[col][col]
        aug[col] = [v / denom for v in aug[col]]

        for row in range(n):
            if row != col:
                factor = aug[row][col]
                aug[row] = [aug[row][j] - factor * aug[col][j]
                            for j in range(n + 1)]

    return [aug[i][n] for i in range(n)]


def _apply_perspective(img: Image.Image, quad: list[list[float]]) -> Image.Image:
    """
    Warp image so that the quad defined by `quad` (TL, TR, BR, BL in original
    image coordinates) fills the entire output rectangle.

    Output size is the bounding box of the quad.
    """
    tl, tr, br, bl = [list(map(float, p)) for p in quad]

    out_w = max(
        math.dist(tl, tr),
        math.dist(bl, br),
    )
    out_h = max(
        math.dist(tl, bl),
        math.dist(tr, br),
    )
    out_w = max(1, int(round(out_w)))
    out_h = max(1, int(round(out_h)))

    # Destination rectangle corners (TL, TR, BR, BL of the output)
    # Use out_w / out_h as the far-edge coordinates (matches frontend convention).
    dst = [
        [0.0,    0.0],
        [out_w,  0.0],
        [out_w,  out_h],
        [0.0,    out_h],
    ]
    src = [tl, tr, br, bl]

    # _solve_perspective_coeffs(src=output_corners, dst=input_quad_corners)
    # → coefficients for Pillow's backward mapping: output pixel → input pixel
    coeffs = _solve_perspective_coeffs(src=dst, dst=src)
    return img.transform(
        (out_w, out_h),
        Image.Transform.PERSPECTIVE,
        coeffs,
        Image.Resampling.BICUBIC,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def apply_transforms(
    upload: InMemoryUploadedFile | Any,
    params: dict[str, Any] | str | None,
) -> InMemoryUploadedFile:
    """
    Apply the JSON-encoded transform pipeline to `upload` and return a new
    InMemoryUploadedFile with the processed image.

    If `params` is None or empty the original file is returned unchanged.
    """
    if not params:
        return upload

    if isinstance(params, str):
        try:
            params = json.loads(params)
        except (json.JSONDecodeError, ValueError):
            return upload

    if not isinstance(params, dict):
        return upload

    # Read original image
    upload.seek(0)
    img = Image.open(upload)
    img.load()
    original_format = img.format or "JPEG"

    # ── 1. Perspective ────────────────────────────────────────────────────────
    quad = params.get("perspective")
    if quad and len(quad) == 4:
        try:
            img = _apply_perspective(img, quad)
        except (ValueError, ZeroDivisionError):
            pass  # skip on degenerate input

    # ── 2. Crop ───────────────────────────────────────────────────────────────
    crop = params.get("crop")
    if crop:
        try:
            x = int(crop["x"])
            y = int(crop["y"])
            cw = int(crop["w"])
            ch = int(crop["h"])
            iw, ih = img.size
            x = max(0, min(x, iw - 1))
            y = max(0, min(y, ih - 1))
            cw = max(1, min(cw, iw - x))
            ch = max(1, min(ch, ih - y))
            img = img.crop((x, y, x + cw, y + ch))
        except (KeyError, TypeError, ValueError):
            pass

    # ── 3. Rotation ───────────────────────────────────────────────────────────
    rotation = params.get("rotation", 0)
    try:
        rotation = int(rotation) % 360
    except (TypeError, ValueError):
        rotation = 0

    if rotation == 90:
        img = img.rotate(90, expand=True)
    elif rotation == 180:
        img = img.rotate(180, expand=True)
    elif rotation == 270:
        img = img.rotate(270, expand=True)

    # ── 4. Flip ───────────────────────────────────────────────────────────────
    if params.get("flipH"):
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if params.get("flipV"):
        img = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)

    # ── Encode back to the original format ───────────────────────────────────
    fmt = original_format.upper()
    if fmt not in ("JPEG", "PNG", "WEBP", "GIF"):
        fmt = "JPEG"

    content_type_map = {
        "JPEG": "image/jpeg",
        "PNG":  "image/png",
        "WEBP": "image/webp",
        "GIF":  "image/gif",
    }

    # JPEG does not support alpha — convert to RGB first
    if fmt == "JPEG" and img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGB")

    buf = io.BytesIO()
    save_kwargs: dict[str, Any] = {}
    if fmt == "JPEG":
        save_kwargs["quality"] = 92
        save_kwargs["subsampling"] = 0

    img.save(buf, format=fmt, **save_kwargs)
    buf.seek(0)

    original_name = getattr(upload, "name", "image.jpg")
    return InMemoryUploadedFile(
        file=buf,
        field_name=getattr(upload, "field_name", None),
        name=original_name,
        content_type=content_type_map[fmt],
        size=buf.getbuffer().nbytes,
        charset=None,
    )
