"""
PortClickAnalyzeView – single-click port detection.

Delegates all detection and OCR logic to ``catalog.port_detection``.
"""
import os

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ViewModelTrainingStatusPermission
from accounts.throttles import PortClickAnalysisThrottle
from catalog.port_detection.click_detector import (
    detect_with_opencv as click_detect_opencv,
    detect_with_yolo as click_detect_yolo,
)
from catalog.port_detection.ocr import read_label_ocr
from catalog.port_detection.security import (
    can_access_private_media,
    get_media_root,
    is_private_media_path,
    is_safe_relpath,
)


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
        side = request.data.get('side', 'front')  # noqa: F841
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

        if not is_safe_relpath(image_path):
            return Response(
                {'error': 'Percorso immagine non valido'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if is_private_media_path(image_path) and not can_access_private_media(request.user):
            return Response(
                {'error': 'Non autorizzato ad analizzare media privati'},
                status=status.HTTP_403_FORBIDDEN,
            )

        abs_path = os.path.join(get_media_root(), image_path)
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

        # ── 1. Port type detection ────────────────────────────────────────
        port_type, confidence = click_detect_yolo(img, click_x, click_y)
        if port_type is None or confidence < 0.20:
            cv_type, cv_conf = click_detect_opencv(img, click_x, click_y)
            # Prefer OpenCV result when it scored higher than low-confidence YOLO.
            if port_type is None or cv_conf > confidence:
                port_type = cv_type
                confidence = cv_conf

        # ── 2. Label via OCR ─────────────────────────────────────────────
        label = read_label_ocr(abs_path, click_x, click_y)

        return Response(
            {
                'is_port': confidence >= 0.20,
                'port_type': port_type,
                'name': label,
                'confidence': round(confidence, 3),
            },
            status=status.HTTP_200_OK,
        )
