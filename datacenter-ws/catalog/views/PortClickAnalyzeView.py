"""
PortClickAnalyzeView – rilevamento porta al click.

Pipeline:
  1. YOLO multi-scala (3 crop size): sceglie il risultato più vicino al click
     con confidenza maggiore. Il modello viene caricato una volta sola.
  2. Fallback OpenCV (se YOLO non disponibile o confidence < soglia):
     bilateral filter → adaptive Canny → fill ratio → darkness score →
     texture refinement (stesso pipeline di PortAnalyzeView batch).
  3. EasyOCR su crop ±18 % con 3 tentativi (CLAHE, invertito, grayscale)
     + pattern-filtering per riconoscere nomi di porte reali.
"""
import os
import re

from django.conf import settings
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ViewModelTrainingStatusPermission
from accounts.throttles import PortClickAnalysisThrottle

# YOLO class-ID → port type
_YOLO_ID_TO_TYPE = {
    0: 'RJ45',
    1: 'SFP',
    2: 'QSFP+',
    3: 'USB-A',
    4: 'SERIAL',
    5: 'LC',
}

# AR → tipo porta (fallback OpenCV)
_AR_RANGES = [
    (0.00, 0.80, 'LC'),
    (0.80, 1.00, 'SFP+'),
    (1.00, 1.20, 'SFP'),
    (1.20, 2.00, 'RJ45'),
    (2.00, 2.90, 'USB-A'),
    (2.90, 99.0, 'SERIAL'),
]

# Pattern tipici dei nomi di porta (per filtrare l'OCR)
_PORT_NAME_RE = re.compile(
    r'^('
    r'\d{1,3}'                             # "1", "24", "48"
    r'|[A-Za-z]{1,4}\d+([/\-]\d+)*'       # "Gi0/1", "Te1/0/1", "eth0", "GE1"
    r'|[A-Za-z]{1,6}\s?\d+([/\-]\d+)*'    # "Port 1", "SFP1"
    r')$',
    re.IGNORECASE,
)

# Singleton: YOLO model e OCR reader (inizializzazione lenta, una volta sola)
_yolo_model = None
_yolo_model_path = None
_yolo_model_mtime = None
_ocr_reader = None


# ── Helpers base ────────────────────────────────────────────────────────────────

def _get_media_root() -> str:
    return os.path.realpath(settings.MEDIA_ROOT)


def _is_safe_relpath(relpath: str) -> bool:
    media_root = _get_media_root()
    target = os.path.realpath(os.path.join(media_root, relpath))
    return target.startswith(media_root + os.sep) or target == media_root


def _is_private_media_path(relpath: str) -> bool:
    private_subdir = getattr(settings, 'PRIVATE_MEDIA_SUBDIR', 'private')
    return relpath.startswith(private_subdir + '/')


def _can_access_private_media(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    try:
        role = user.profile.role
    except Exception:
        return False
    # Reuse the same role capability used to issue signed private URLs.
    return bool(getattr(role, 'can_view_model_training_status', False))


def _get_yolo_model():
    """Carica il modello YOLO una volta sola e lo restituisce dal cache."""
    global _yolo_model, _yolo_model_path, _yolo_model_mtime
    model_path = os.path.join(_get_media_root(), 'models', 'port-yolo.pt')
    if not os.path.isfile(model_path):
        return None, None
    try:
        mtime = os.path.getmtime(model_path)
    except OSError:
        return None, None
    # Ricarica solo se il file è cambiato (nuovo training)
    if _yolo_model is None or _yolo_model_path != model_path or _yolo_model_mtime != mtime:
        from ultralytics import YOLO
        _yolo_model = YOLO(model_path)
        _yolo_model_path = model_path
        _yolo_model_mtime = mtime
    return _yolo_model, model_path


def _get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _ocr_reader


# ── Preprocessing ───────────────────────────────────────────────────────────────

def _preprocess_for_inference(img):
    """CLAHE (LAB) + unsharp mask — identico a PortAnalyzeView batch."""
    import cv2
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)
    blur = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=1.5)
    return cv2.addWeighted(enhanced, 1.4, blur, -0.4, 0)


def _auto_canny(gray):
    """Adaptive Canny con soglie derivate dalla mediana dell'immagine."""
    import cv2
    import numpy as np
    v = float(np.median(gray))
    sigma = 0.33
    lo = max(10, int((1.0 - sigma) * v))
    hi = min(250, int((1.0 + sigma) * v))
    if hi < lo * 2:
        hi = min(250, lo * 3)
    return cv2.Canny(gray, lo, hi)


def _crop_around_click(img, click_x_pct: float, click_y_pct: float, pad_pct: float):
    """Ritorna (crop, x1, y1, crop_cx, crop_cy)."""
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
    for ar_min, ar_max, ptype in _AR_RANGES:
        if ar_min <= ar < ar_max:
            return ptype
    return 'OTHER'


# ── Rilevamento tipo porta ──────────────────────────────────────────────────────

def _detect_with_yolo(img, click_x: float, click_y: float):
    """
    YOLO multi-scala: esegue l'inferenza su 3 crop size (piccolo / medio /
    grande) e restituisce il risultato con confidenza più alta tra i box
    più vicini al click.
    Usa il modello dal cache globale — nessun reload per request.
    """
    model, _ = _get_yolo_model()
    if model is None:
        return None, 0.0

    try:
        best_type, best_conf, best_dist = None, 0.0, float('inf')

        for pad in (0.14, 0.22, 0.32):
            crop, _, _, crop_cx, crop_cy = _crop_around_click(
                img, click_x, click_y, pad_pct=pad
            )
            if crop.size == 0:
                continue

            crop_proc = _preprocess_for_inference(crop)
            results = model(crop_proc, verbose=False, conf=0.18, iou=0.40)[0]

            if results.boxes is None or len(results.boxes) == 0:
                continue

            for box in results.boxes:
                bx = float(box.xywh[0][0])
                by = float(box.xywh[0][1])
                dist = ((bx - crop_cx) ** 2 + (by - crop_cy) ** 2) ** 0.5
                conf = float(box.conf[0])
                # Preferisce box vicino al click con confidenza alta;
                # normalizza la distanza rispetto alla dimensione del crop
                crop_diag = (crop.shape[0] ** 2 + crop.shape[1] ** 2) ** 0.5
                score = conf - 0.3 * (dist / (crop_diag + 1))
                current_score = best_conf - 0.3 * (best_dist / (crop_diag + 1))
                if score > current_score:
                    best_conf = conf
                    best_dist = dist
                    best_type = _YOLO_ID_TO_TYPE.get(int(box.cls[0]), 'OTHER')

        return best_type, best_conf

    except Exception:
        return None, 0.0


def _detect_with_opencv(img, click_x: float, click_y: float):
    """
    Fallback OpenCV identico alla pipeline di PortAnalyzeView:
    - Bilateral filter (preserva i bordi meglio di Gaussian)
    - Adaptive Canny (soglie dalla mediana)
    - Fill ratio + minAreaRect fill ratio
    - Darkness score (distingue SFP metal/scuro da RJ45 plastica/chiaro)
    - Texture refinement nella zona AR ambigua 0.90–1.50
    Restituisce (port_type, confidence).
    """
    try:
        import cv2
        import numpy as np

        crop, _, _, crop_cx, crop_cy = _crop_around_click(
            img, click_x, click_y, pad_pct=0.22
        )
        if crop.size == 0:
            return 'RJ45', 0.0

        H, W = crop.shape[:2]

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

        # Bilateral: preserva i bordi delle aperture di porta
        blurred = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)
        edges = _auto_canny(blurred)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edges = cv2.dilate(edges, kernel, iterations=1)
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=1)

        # RETR_CCOMP cattura sia i frame esterni che le aperture interne
        contours, _ = cv2.findContours(
            edges, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
        )

        min_area = max(60, W * H * 0.0004)
        max_area = W * H * 0.50  # crop piccolo → soglia più permissiva

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

            # Darkness score: le aperture di porta sono più scure del bezel
            roi_mean = float(np.mean(gray[y:y + ch, x:x + cw]))
            margin = max(3, min(12, int(min(cw, ch) * 0.30)))
            sy0, sy1 = max(0, y - margin), min(H, y + ch + margin)
            sx0, sx1 = max(0, x - margin), min(W, x + cw + margin)
            surround = gray[sy0:sy1, sx0:sx1]
            surround_mean = float(
                np.mean(surround)) if surround.size else roi_mean
            darkness = max(0.0, (surround_mean - roi_mean) /
                           (surround_mean + 1.0))
            if darkness < 0.04:
                continue

            # Confidenza composita
            conf = min(1.0, mar_fill * 0.40 + rect_fill *
                       0.25 + min(darkness * 1.75, 0.35))
            if conf < 0.35:
                continue

            # Prossimità al click (bonus significativo per il box più centrale)
            ccx, ccy = x + cw / 2, y + ch / 2
            dist = ((ccx - crop_cx) ** 2 + (ccy - crop_cy) ** 2) ** 0.5
            max_dist = (W ** 2 + H ** 2) ** 0.5
            proximity = max(0.0, 1.0 - dist / max_dist)
            score = conf * 0.60 + proximity * 0.40

            if score > best_score:
                best_score = score
                best = {'ar': ar, 'darkness': darkness,
                        'conf': conf, 'cw': cw, 'ch': ch}

        if best is None:
            return 'RJ45', 0.0

        port_type = _ar_to_type(best['ar'])

        # Texture refinement nella zona AR ambigua (identico a PortAnalyzeView)
        ar_c, dk_c = best['ar'], best['darkness']
        if 0.90 <= ar_c <= 1.50:
            if dk_c > 0.30 and ar_c < 1.30:
                port_type = 'SFP' if ar_c >= 1.00 else 'SFP+'
            elif dk_c < 0.18:
                port_type = 'RJ45'

        # cap a 0.65: è fallback
        return port_type, round(min(0.65, best['conf']), 3)

    except Exception:
        return 'RJ45', 0.0


# ── OCR ────────────────────────────────────────────────────────────────────────

def _is_port_name(text: str) -> bool:
    """True se il testo assomiglia a un nome/numero di porta reale."""
    text = text.strip()
    if not text or len(text) > 16:
        return False
    return bool(_PORT_NAME_RE.match(text))


def _ocr_on_image(reader, ocr_img, cx: float, cy: float):
    """
    Esegue EasyOCR su ocr_img e restituisce (testo, score) del testo
    con score più alto, dove score = confidenza × prossimità + bonus pattern.
    """
    h, w = ocr_img.shape[:2]
    max_dist = max(w, h) * 0.70
    results = reader.readtext(ocr_img, detail=1, paragraph=False)
    best, best_score = None, -1.0
    for (bbox, text, conf) in results:
        text = text.strip()
        if not text:
            continue
        bx = (bbox[0][0] + bbox[2][0]) / 2
        by = (bbox[0][1] + bbox[2][1]) / 2
        dist = ((bx - cx) ** 2 + (by - cy) ** 2) ** 0.5
        proximity = max(0.0, 1.0 - dist / max_dist)
        # Bonus se il testo corrisponde a un pattern di nome porta
        pattern_bonus = 0.15 if _is_port_name(text) else 0.0
        score = conf * (0.35 + 0.65 * proximity) + pattern_bonus
        if score > best_score:
            best_score = score
            best = (text, score)
    return best


def _read_label_ocr(abs_path: str, click_x: float, click_y: float):
    """
    Tenta di leggere l'etichetta della porta con 3 strategie:
    1. CLAHE grayscale + upscale (migliora testo a basso contrasto)
    2. Immagine invertita + upscale (testo chiaro su sfondo scuro)
    3. Grayscale semplice upscalato (baseline)
    Sceglie il risultato con score più alto tra i tre.
    """
    try:
        import cv2
        import numpy as np

        img = cv2.imread(abs_path)
        if img is None:
            return None

        # Crop leggermente più ampio per catturare etichette ai bordi della porta
        crop_raw, _, _, crop_cx_raw, crop_cy_raw = _crop_around_click(
            img, click_x, click_y, pad_pct=0.18
        )
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

        # ── Tentativo 1: CLAHE grayscale ──────────────────────────────────────
        gray = cv2.cvtColor(crop_raw, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
        gray_cl = clahe.apply(gray)
        gray_cl, scale1 = _upscale_gray(gray_cl)
        r1 = _ocr_on_image(reader, _to_bgr(gray_cl),
                           crop_cx_raw * scale1, crop_cy_raw * scale1)

        # ── Tentativo 2: immagine invertita (testo bianco su sfondo scuro) ────
        gray_inv = cv2.bitwise_not(gray_cl)
        r2 = _ocr_on_image(reader, _to_bgr(gray_inv),
                           crop_cx_raw * scale1, crop_cy_raw * scale1)

        # ── Tentativo 3: grayscale semplice + denoising ───────────────────────
        gray_dn = cv2.fastNlMeansDenoising(gray, h=7)
        gray_dn, scale3 = _upscale_gray(gray_dn)
        r3 = _ocr_on_image(reader, _to_bgr(gray_dn),
                           crop_cx_raw * scale3, crop_cy_raw * scale3)

        # Sceglie il risultato con score più alto
        candidates = [r for r in (r1, r2, r3) if r is not None]
        if not candidates:
            return None

        best_text, best_score = max(candidates, key=lambda r: r[1])

        # Soglia più bassa se il testo corrisponde a un pattern di nome porta
        threshold = 0.10 if _is_port_name(best_text) else 0.18
        return best_text if best_score > threshold else None

    except Exception:
        return None


# ── View ───────────────────────────────────────────────────────────────────────

class PortClickAnalyzeView(APIView):
    """
    Single-click port detection endpoint.

    **Rate Limit**: 200 clicks per hour per user (allows interactive exploration).
    """
    permission_classes = [IsAuthenticated, ViewModelTrainingStatusPermission]
    throttle_classes = [PortClickAnalysisThrottle]

    @extend_schema(
        request=inline_serializer(
            name='PortClickAnalyzeRequest',
            fields={
                'image_path': serializers.CharField(),
                'side': serializers.CharField(default='front'),
                'click_x': serializers.FloatField(),
                'click_y': serializers.FloatField(),
            },
        ),
        responses={
            200: inline_serializer(
                name='PortClickAnalyzeResponse',
                fields={
                    'is_port': serializers.BooleanField(),
                    'port_type': serializers.CharField(allow_null=True),
                    'name': serializers.CharField(allow_null=True),
                    'confidence': serializers.FloatField(),
                },
            )
        },
    )
    def post(self, request):
        image_path = (request.data.get('image_path') or '').strip()
        side = request.data.get('side', 'front')
        click_x = request.data.get('click_x')
        click_y = request.data.get('click_y')

        if not image_path or click_x is None or click_y is None:
            return Response(
                {'error': 'image_path, click_x e click_y sono obbligatori'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            click_x = float(click_x)
            click_y = float(click_y)
        except (TypeError, ValueError):
            return Response(
                {'error': 'click_x e click_y devono essere numeri'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not _is_safe_relpath(image_path):
            return Response(
                {'error': 'Percorso immagine non valido'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if _is_private_media_path(image_path) and not _can_access_private_media(request.user):
            return Response(
                {'error': 'Non autorizzato ad analizzare media privati'},
                status=status.HTTP_403_FORBIDDEN,
            )

        abs_path = os.path.join(_get_media_root(), image_path)
        if not os.path.isfile(abs_path):
            return Response(
                {'error': 'Immagine non trovata'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            import cv2
            img = cv2.imread(abs_path)
            if img is None:
                return Response(
                    {'error': 'Impossibile leggere l\'immagine'},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
        except Exception:
            return Response(
                {'error': 'Errore nel caricamento dell\'immagine'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # ── 1. Tipo porta ──────────────────────────────────────────────────────
        port_type, confidence = _detect_with_yolo(img, click_x, click_y)
        if port_type is None or confidence < 0.20:
            cv_type, cv_conf = _detect_with_opencv(img, click_x, click_y)
            # Usa YOLO anche a bassa confidenza se è superiore a OpenCV
            if port_type is None or cv_conf > confidence:
                port_type = cv_type
                confidence = cv_conf

        is_port = confidence >= 0.20

        # ── 2. Etichetta (OCR) ─────────────────────────────────────────────────
        label = _read_label_ocr(abs_path, click_x, click_y)

        return Response(
            {
                'is_port': is_port,
                'port_type': port_type,
                'name': label,
                'confidence': round(confidence, 3),
            },
            status=status.HTTP_200_OK,
        )
