"""
PortAnalyzeView – batch full-image port detection.

Delegates all detection logic to ``catalog.port_detection`` so this file
contains only the DRF view wiring.
"""
import os

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ViewModelTrainingStatusPermission
from accounts.throttles import PortAnalysisThrottle
from catalog.port_detection import (
    assign_names,
    can_access_private_media,
    detect_with_opencv,
    detect_with_yolo,
    get_media_root,
    is_private_media_path,
    is_safe_relpath,
)


class PortAnalyzeView(APIView):
    """
    POST /asset/port-analyze

    Body: { "image_path": "components/switch.jpg", "side": "front" }

    Returns a list of detected ports:
    [{ "port_type": "RJ45", "pos_x": 12.5, "pos_y": 45.0,
       "name": "GigabitEthernet0/0", "confidence": 0.82 }, ...]

    Detection order: YOLO (if model available) then OpenCV fallback.

    **Rate Limit**: 100 analyses per hour per user (prevents inference spam).
    """
    permission_classes = [IsAuthenticated, ViewModelTrainingStatusPermission]
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
        side = request.data.get('side', 'front')  # noqa: F841

        if not is_safe_relpath(image_path):
            return Response(
                {'error': 'Invalid image path.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if is_private_media_path(image_path) and not can_access_private_media(request.user):
            return Response(
                {'error': 'Not authorized to analyze private media.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        abs_image_path = os.path.join(get_media_root(), image_path)
        if not os.path.isfile(abs_image_path):
            return Response(
                {'error': 'Image not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        model_path = os.path.join(get_media_root(), 'models', 'port-yolo.pt')

        try:
            if os.path.isfile(model_path):
                ports = detect_with_yolo(abs_image_path, model_path)
                if not ports:
                    # YOLO returned nothing (model not yet trained or unrecognisable
                    # panel orientation): fall back to the OpenCV heuristic.
                    ports = detect_with_opencv(abs_image_path)
            else:
                ports = detect_with_opencv(abs_image_path)
        except Exception:
            # YOLO crash (missing dependency, corrupt model …): OpenCV fallback.
            try:
                ports = detect_with_opencv(abs_image_path)
            except Exception:
                ports = []

        return Response(assign_names(ports), status=status.HTTP_200_OK)
