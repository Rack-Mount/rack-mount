import hashlib
import os
import shutil

import yaml
from django.conf import settings
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import PortTrainingPermission
from accounts.throttles import PortTrainingThrottle
from accounts.models import SecurityAuditLog

# ── Constants ──────────────────────────────────────────────────────────────────
# Must stay in sync with CLASS_NAMES / PORT_CLASS_ID in train_port_detector.py.
# class 0=RJ45, 1=SFP/SFP+/SFP28, 2=QSFP+/28/DD, 3=USB, 4=SERIAL, 5=LC
_CLASS_NAMES = ['RJ45', 'SFP/SFP+', 'QSFP', 'USB', 'SERIAL', 'LC']

_PORT_CLASS_ID = {
    'RJ45': 0, 'MGMT': 0,
    'SFP': 1, 'SFP+': 1, 'SFP28': 1,   # same cage
    'QSFP+': 2, 'QSFP28': 2, 'QSFP-DD': 2,
    'USB-A': 3, 'USB-C': 3,
    'SERIAL': 4,
    'LC': 5, 'SC': 5, 'FC': 5,
}

# Estimated bounding-box dimensions as a fraction of image size (0–1).
# Values match PORT_BW / PORT_BH in train_port_detector.py.
_PORT_BW = {
    'RJ45': 0.055, 'MGMT': 0.055,
    'SFP': 0.030, 'SFP+': 0.030, 'SFP28': 0.030,
    'QSFP+': 0.045, 'QSFP28': 0.045, 'QSFP-DD': 0.045,
    'USB-A': 0.040, 'USB-C': 0.040,
    'SERIAL': 0.060,
    'LC': 0.035, 'SC': 0.035, 'FC': 0.035,
}
_PORT_BH = {
    'RJ45': 0.060, 'MGMT': 0.060,
    'SFP': 0.048, 'SFP+': 0.048, 'SFP28': 0.048,
    'QSFP+': 0.052, 'QSFP28': 0.052, 'QSFP-DD': 0.052,
    'USB-A': 0.045, 'USB-C': 0.045,
    'SERIAL': 0.040,
    'LC': 0.060, 'SC': 0.060, 'FC': 0.060,
}

# ── Security helpers ───────────────────────────────────────────────────────────


def _get_media_root() -> str:
    return os.path.realpath(settings.MEDIA_ROOT)


def _is_safe_relpath(relpath: str) -> bool:
    """Reject any path that could escape MEDIA_ROOT."""
    if not relpath or relpath.startswith('/') or '..' in relpath.split('/'):
        return False
    trusted = _get_media_root()
    abs_path = os.path.realpath(os.path.join(trusted, relpath))
    return abs_path.startswith(trusted + os.sep)


# ── Training helpers ───────────────────────────────────────────────────────────

def _write_data_yaml(training_dir: str) -> str:
    data_yaml = os.path.join(training_dir, 'data.yaml')
    train_img = os.path.join(training_dir, 'images', 'train')
    val_img = os.path.join(training_dir, 'images', 'val')
    # If there is no dedicated val split yet, fall back to using train images
    # for validation so YOLO doesn't abort.
    if not os.path.isdir(val_img) or not os.listdir(val_img):
        val_img = train_img
    content = {
        'train': train_img,
        'val':   val_img,
        'nc':    len(_CLASS_NAMES),
        'names': _CLASS_NAMES,
    }
    with open(data_yaml, 'w') as f:
        yaml.dump(content, f, default_flow_style=False)
    return data_yaml


# ── View ───────────────────────────────────────────────────────────────────────

class PortAnnotateView(APIView):
    """
    POST /asset/port-annotate

    Body:
    {
        "image_path": "components/switch.jpg",
        "side": "front",
        "annotations": [
            { "port_type": "RJ45", "pos_x": 12.5, "pos_y": 45.0, "name": "Gi0/0" }
        ]
    }

    Saves the annotations as YOLO training data.
    Il retraining è gestito esclusivamente da PortCorrectionView con logica smart.

    **Permission**: Requires `can_provide_port_training` role permission.
    **Audit**: All submissions logged to SecurityAuditLog.
    **Rate Limit**: 10 annotations per hour per user (prevents training data poisoning).
    """
    permission_classes = [IsAuthenticated, PortTrainingPermission]
    throttle_classes = [PortTrainingThrottle]

    @extend_schema(
        request=inline_serializer(
            name='PortAnnotateRequest',
            fields={
                'image_path': serializers.CharField(),
                'side': serializers.CharField(default='front'),
                'annotations': inline_serializer(
                    name='PortAnnotation',
                    fields={
                        'port_type': serializers.CharField(),
                        'pos_x': serializers.FloatField(),
                        'pos_y': serializers.FloatField(),
                        'name': serializers.CharField(required=False, default=''),
                    },
                    many=True,
                ),
            },
        ),
        responses={
            200: inline_serializer(
                name='PortAnnotateResponse',
                fields={
                    'saved': serializers.IntegerField(),
                    'total_images': serializers.IntegerField(),
                },
            )
        },
    )
    def post(self, request):
        image_path = request.data.get('image_path', '')
        side = request.data.get('side', 'front')
        annotations = request.data.get('annotations', [])

        if not _is_safe_relpath(image_path):
            return Response(
                {'error': 'Invalid image path.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        media_root = _get_media_root()
        abs_image_path = os.path.join(media_root, image_path)
        if not os.path.isfile(abs_image_path):
            return Response(
                {'error': 'Image not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not isinstance(annotations, list) or not annotations:
            return Response({'saved': 0, 'total_images': 0})

        # Prepare training directories with train/val split.
        # The split is deterministic: ~20 % of images land in val based on hash.
        training_dir = os.path.join(media_root, 'training')
        images_dir = os.path.join(training_dir, 'images')
        labels_dir = os.path.join(training_dir, 'labels')

        # Derive a stable, collision-resistant filename from image_path + side
        hash_key = hashlib.sha256(
            f'{image_path}|{side}'.encode()
        ).hexdigest()[:16]

        # First hex char mod 5 == 0  →  val (~20 %);  otherwise  →  train
        split = 'val' if int(hash_key[0], 16) % 5 == 0 else 'train'
        images_split_dir = os.path.join(images_dir, split)
        labels_split_dir = os.path.join(labels_dir, split)
        os.makedirs(images_split_dir, exist_ok=True)
        os.makedirs(labels_split_dir, exist_ok=True)

        dest_image = os.path.join(images_split_dir, f'{hash_key}.jpg')
        dest_label = os.path.join(labels_split_dir, f'{hash_key}.txt')

        # Copy source image (once per image+side combination)
        if not os.path.isfile(dest_image):
            shutil.copy2(abs_image_path, dest_image)

        # Write YOLO format: class_id cx cy bw bh  (all 0–1 fractions)
        with open(dest_label, 'w') as f:
            for ann in annotations:
                port_type = str(ann.get('port_type', 'RJ45'))
                cls_id = _PORT_CLASS_ID.get(port_type, 0)
                cx = float(ann.get('pos_x', 50)) / 100.0
                cy = float(ann.get('pos_y', 50)) / 100.0
                bw = _PORT_BW.get(port_type, 0.045)
                bh = _PORT_BH.get(port_type, 0.055)
                # Keep centre within valid bounds
                cx = max(bw / 2, min(1.0 - bw / 2, cx))
                cy = max(bh / 2, min(1.0 - bh / 2, cy))
                f.write(f'{cls_id} {cx:.4f} {cy:.4f} {bw:.4f} {bh:.4f}\n')

        _write_data_yaml(training_dir)

        label_count = 0
        for sub in ('train', 'val'):
            sub_dir = os.path.join(labels_dir, sub)
            if os.path.isdir(sub_dir):
                label_count += sum(1 for fn in os.listdir(sub_dir)
                                   if fn.endswith('.txt'))

        # Log audit trail
        SecurityAuditLog.objects.create(
            user=request.user,
            action=SecurityAuditLog.Action.PORT_ANNOTATE,
            resource_type='port_image',
            resource_id=image_path,
            delta_data={
                'port_type': list({ann.get('port_type', 'RJ45') for ann in annotations}),
                'annotation_count': len(annotations),
                'side': side,
            },
            ip_address=self._get_client_ip(request),
        )

        return Response(
            {'saved': len(annotations), 'total_images': label_count},
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _get_client_ip(request):
        """Extract client IP while trusting X-Forwarded-For only from known proxies."""
        remote_addr = request.META.get('REMOTE_ADDR', '')
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        trusted_proxies = set(
            getattr(settings, 'TRUSTED_PROXY_IPS', ['127.0.0.1', '::1'])
        )
        if x_forwarded_for and remote_addr in trusted_proxies:
            return x_forwarded_for.split(',')[0].strip()
        return remote_addr
