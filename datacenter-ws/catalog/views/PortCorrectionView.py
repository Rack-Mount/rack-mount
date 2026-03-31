"""
PortCorrectionView – manual correction ingestion and smart retraining trigger.

Delegates state management and training helpers to
``catalog.port_detection.training_state``.
"""
import hashlib
import logging
import os
import shutil
import threading

from django.conf import settings
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import SecurityAuditLog
from accounts.permissions import PortCorrectionPermission
from accounts.throttles import PortCorrectionThrottle
from catalog.port_detection.constants import PORT_CLASS_ID, PORT_BW, PORT_BH
from catalog.port_detection.security import get_media_root, is_safe_relpath
from catalog.port_detection.training_state import (
    _state_lock,
    load_state,
    minutes_since_last_train,
    run_background_train,
    save_state,
    write_data_yaml,
)

logger = logging.getLogger(__name__)

# Configurable thresholds (overridable via settings).
MIN_CORRECTIONS = int(getattr(settings, 'PORT_CORRECTION_MIN_CORRECTIONS', 10))
MIN_INTERVAL_MIN = int(getattr(settings, 'PORT_CORRECTION_MIN_INTERVAL_MIN', 60))


class PortCorrectionView(APIView):
    """
    POST /asset/port-correction

    Receives a manual correction (predicted_type → actual_type) and:
    1. Saves the training sample with the correct type.
    2. Increments the correction counter.
    3. Triggers background retraining when thresholds are met.

    **Permission**: Requires ``can_provide_port_corrections`` role permission.
    **Audit**: All corrections logged to SecurityAuditLog.
    **Rate Limit**: 30 corrections per hour per user (prevents retraining floods).
    """
    permission_classes = [IsAuthenticated, PortCorrectionPermission]
    throttle_classes = [PortCorrectionThrottle]

    @extend_schema(
        request=inline_serializer(
            name='PortCorrectionRequest',
            fields={
                'image_path': serializers.CharField(),
                'side': serializers.CharField(default='front'),
                'pos_x': serializers.FloatField(default=50.0),
                'pos_y': serializers.FloatField(default=50.0),
                'predicted_type': serializers.CharField(required=False, default=''),
                'actual_type': serializers.CharField(),
            },
        ),
        responses={
            200: inline_serializer(
                name='PortCorrectionResponse',
                fields={
                    'saved': serializers.BooleanField(),
                    'predicted_type': serializers.CharField(),
                    'actual_type': serializers.CharField(),
                    'training_triggered': serializers.BooleanField(),
                    'corrections_since_last_train': serializers.IntegerField(),
                    'total_corrections': serializers.IntegerField(),
                },
            )
        },
    )
    def post(self, request):
        image_path = (request.data.get('image_path') or '').strip()
        side = request.data.get('side', 'front')  # noqa: F841
        predicted_type = (request.data.get('predicted_type') or '').strip()
        actual_type = (request.data.get('actual_type') or '').strip()

        try:
            pos_x = float(request.data.get('pos_x', 50))
            pos_y = float(request.data.get('pos_y', 50))
        except (TypeError, ValueError):
            return Response(
                {'error': 'pos_x e pos_y devono essere numeri'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not image_path or not actual_type:
            return Response(
                {'error': 'image_path e actual_type sono obbligatori'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not is_safe_relpath(image_path):
            return Response(
                {'error': 'Percorso immagine non valido'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        media_root = get_media_root()
        abs_image_path = os.path.join(media_root, image_path)
        if not os.path.isfile(abs_image_path):
            return Response(
                {'error': 'Immagine non trovata'},
                status=status.HTTP_404_NOT_FOUND,
            )

        cls_id = PORT_CLASS_ID.get(actual_type)
        if cls_id is None:
            return Response(
                {'error': f'Tipo porta non riconosciuto: {actual_type}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── 1. Save training sample with the corrected type ───────────────
        training_dir = os.path.join(media_root, 'training')
        hash_key = hashlib.sha256(f'{image_path}|{side}'.encode()).hexdigest()[:16]
        split = 'val' if int(hash_key[0], 16) % 5 == 0 else 'train'

        images_dir = os.path.join(training_dir, 'images', split)
        labels_dir = os.path.join(training_dir, 'labels', split)
        os.makedirs(images_dir, exist_ok=True)
        os.makedirs(labels_dir, exist_ok=True)

        dest_image = os.path.join(images_dir, f'{hash_key}.jpg')
        dest_label = os.path.join(labels_dir, f'{hash_key}.txt')

        if not os.path.isfile(dest_image):
            shutil.copy2(abs_image_path, dest_image)

        cx = max(0.0, min(1.0, pos_x / 100.0))
        cy = max(0.0, min(1.0, pos_y / 100.0))
        bw = PORT_BW.get(actual_type, 0.045)
        bh = PORT_BH.get(actual_type, 0.055)
        cx = max(bw / 2, min(1.0 - bw / 2, cx))
        cy = max(bh / 2, min(1.0 - bh / 2, cy))
        new_line = f'{cls_id} {cx:.4f} {cy:.4f} {bw:.4f} {bh:.4f}\n'

        existing_lines = []
        if os.path.isfile(dest_label):
            with open(dest_label) as f:
                existing_lines = f.readlines()

        # Replace the label line whose centre is closest to the corrected position.
        best_idx = None
        best_dist = float('inf')
        for i, line in enumerate(existing_lines):
            parts = line.strip().split()
            if len(parts) == 5:
                ecx, ecy = float(parts[1]), float(parts[2])
                dist = ((ecx - cx) ** 2 + (ecy - cy) ** 2) ** 0.5
                if dist < best_dist:
                    best_dist = dist
                    best_idx = i

        PROXIMITY_THRESH = 0.05  # 5 % of image
        if best_idx is not None and best_dist < PROXIMITY_THRESH:
            existing_lines[best_idx] = new_line
        else:
            existing_lines.append(new_line)

        with open(dest_label, 'w') as f:
            f.writelines(existing_lines)

        data_yaml = write_data_yaml(training_dir)
        models_dir = os.path.join(media_root, 'models')
        os.makedirs(models_dir, exist_ok=True)

        # ── 2. Update correction counter ──────────────────────────────────
        should_train = False
        with _state_lock:
            state = load_state()
            state['corrections_since_last_train'] = state.get('corrections_since_last_train', 0) + 1
            state['total_corrections'] = state.get('total_corrections', 0) + 1

            # ── 3. Evaluate retraining conditions ─────────────────────────
            enough_corrections = state['corrections_since_last_train'] >= MIN_CORRECTIONS
            enough_time = minutes_since_last_train(state) >= MIN_INTERVAL_MIN
            not_training = not state.get('is_training', False)

            if enough_corrections and enough_time and not_training:
                state['is_training'] = True
                should_train = True

            save_state(state)

        if should_train:
            try:
                from catalog.tasks import retrain_yolo
                retrain_yolo.delay(data_yaml, models_dir)
            except Exception:
                # Celery unavailable → fall back to background thread so
                # corrections are never silently dropped.
                logger.warning(
                    'Celery unavailable, falling back to threading for YOLO retraining',
                    exc_info=True,
                )
                threading.Thread(
                    target=run_background_train,
                    args=(data_yaml, models_dir),
                    daemon=False,
                    name='yolo-retrain',
                ).start()

        with _state_lock:
            state = load_state()

        SecurityAuditLog.objects.create(
            user=request.user,
            action=SecurityAuditLog.Action.PORT_CORRECTION,
            resource_type='port_image',
            resource_id=image_path,
            delta_data={
                'predicted_type': predicted_type,
                'actual_type': actual_type,
                'position': {'x': pos_x, 'y': pos_y},
                'side': side,
                'training_triggered': should_train,
            },
            ip_address=self._get_client_ip(request),
        )

        return Response(
            {
                'saved': True,
                'predicted_type': predicted_type,
                'actual_type': actual_type,
                'training_triggered': should_train,
                'corrections_since_last_train': state.get('corrections_since_last_train', 0),
                'total_corrections': state.get('total_corrections', 0),
            },
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _get_client_ip(request):
        """Extract client IP, trusting X-Forwarded-For only from known proxies."""
        remote_addr = request.META.get('REMOTE_ADDR', '')
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        trusted_proxies = set(getattr(settings, 'TRUSTED_PROXY_IPS', ['127.0.0.1', '::1']))
        if x_forwarded_for and remote_addr in trusted_proxies:
            return x_forwarded_for.split(',')[0].strip()
        return remote_addr
