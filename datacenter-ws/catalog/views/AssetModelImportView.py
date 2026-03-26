import base64
import binascii
import io
import uuid

from django.core.files.base import ContentFile
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiExample
from drf_spectacular.types import OpenApiTypes

from accounts.permissions import ImportCatalogPermission
from catalog.models import AssetModel, Vendor
from catalog.models.AssetType import AssetType
from catalog.serializers import AssetModelSerializer

# Max 10 MB per image payload
_MAX_IMAGE_BYTES = 10 * 1024 * 1024

_ALLOWED_MIME = {
    'image/jpeg': 'jpg',
    'image/jpg':  'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/gif':  'gif',
}


def _decode_image(data_url: str, field_name: str):
    if not data_url.startswith('data:'):
        raise ValueError(_('Not a valid Data URL.'))
    try:
        meta, encoded = data_url.split(',', 1)
    except ValueError:
        raise ValueError(_('Malformed Data URL.'))

    mime = meta.split(';')[0].replace('data:', '').strip()

    ext = _ALLOWED_MIME.get(mime)
    if ext is None:
        raise ValueError(_('Unsupported image type: %s') % mime)

    try:
        raw = base64.b64decode(encoded)
    except binascii.Error:
        raise ValueError(_('Invalid base64 data.'))

    if len(raw) > _MAX_IMAGE_BYTES:
        raise ValueError(
            _('Image exceeds maximum allowed size of %d MB.') % (
                _MAX_IMAGE_BYTES // 1024 // 1024)
        )

    try:
        from PIL import Image
        with Image.open(io.BytesIO(raw)) as img:
            img.verify()
    except Exception:
        raise ValueError(
            _('Uploaded file for %s is not a valid image.') % field_name)

    filename = f'{uuid.uuid4().hex}.{ext}'
    return ContentFile(raw, name=filename)


class AssetModelImportView(APIView):
    permission_classes = [IsAuthenticated, ImportCatalogPermission]

    @extend_schema(
        summary='Import an AssetModel from JSON (with optional base64 images)',
        request={
            'application/json': {
                'type': 'object',
                'required': ['name', 'vendor', 'type'],
                'properties': {
                    'name':        {'type': 'string'},
                    'vendor':      {'type': 'string'},
                    'type':        {'type': 'string'},
                    'rack_units':  {'type': 'integer', 'default': 1},
                    'note':        {'type': 'string'},
                    'front_image': {'type': 'string'},
                    'rear_image':  {'type': 'string'},
                },
            }
        },
        responses={
            201: AssetModelSerializer,
            400: OpenApiResponse(description='Missing or invalid fields'),
            409: OpenApiResponse(description='Model already exists'),
        },
    )
    def post(self, request):
        data = request.data

        name = str(data.get('name', '')).strip()
        vendor_name = str(data.get('vendor', '')).strip()
        type_name = str(data.get('type', '')).strip()

        errors = {}
        if not name:
            errors['name'] = _('This field is required.')
        if not vendor_name:
            errors['vendor'] = _('This field is required.')
        if not type_name:
            errors['type'] = _('This field is required.')
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        vendor, _ = Vendor.objects.get_or_create(name=vendor_name)
        asset_type, _ = AssetType.objects.get_or_create(name=type_name)

        if AssetModel.objects.filter(name=name, vendor=vendor, type=asset_type).exists():
            return Response(
                {
                    'detail': _('A model named "%(name)s" already exists for %(vendor)s (%(type)s).') % {
                        'name': name, 'vendor': vendor_name, 'type': type_name,
                    },
                    'code': 'already_exists',
                },
                status=status.HTTP_409_CONFLICT,
            )

        rack_units = data.get('rack_units', 1)
        try:
            rack_units = max(1, int(rack_units))
        except (ValueError, TypeError):
            rack_units = 1

        instance = AssetModel(
            name=name,
            vendor=vendor,
            type=asset_type,
            rack_units=rack_units,
            note=str(data.get('note', '')),
        )

        front_raw = data.get('front_image')
        rear_raw = data.get('rear_image')

        if front_raw:
            try:
                instance.front_image = _decode_image(front_raw, 'front_image')
            except ValueError:
                return Response(
                    {'front_image': _('Invalid front image data.')},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if rear_raw:
            try:
                instance.rear_image = _decode_image(rear_raw, 'rear_image')
            except ValueError:
                return Response(
                    {'rear_image': _('Invalid rear image data.')},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        instance.save()

        serializer = AssetModelSerializer(instance, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
