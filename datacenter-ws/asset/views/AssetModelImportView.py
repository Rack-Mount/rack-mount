import base64
import binascii
import uuid

from django.core.files.base import ContentFile
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiExample
from drf_spectacular.types import OpenApiTypes

from asset.models import AssetModel, Vendor
from asset.models.AssetType import AssetType
from asset.serializers import AssetModelSerializer


def _decode_image(data_url: str, field_name: str):
    """
    Decode a Data URL (``data:<mime>;base64,<data>``) into a Django ContentFile.
    Returns (ContentFile, extension) or raises ValueError on bad input.
    """
    if not data_url.startswith('data:'):
        raise ValueError(f'{field_name}: not a valid Data URL')
    try:
        meta, encoded = data_url.split(',', 1)
    except ValueError:
        raise ValueError(f'{field_name}: malformed Data URL')

    mime = meta.split(';')[0].replace('data:', '').strip()
    ext_map = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
    }
    ext = ext_map.get(mime, 'jpg')

    try:
        raw = base64.b64decode(encoded)
    except binascii.Error:
        raise ValueError(f'{field_name}: invalid base64 data')

    filename = f'{uuid.uuid4().hex}.{ext}'
    return ContentFile(raw, name=filename)


class AssetModelImportView(APIView):
    """
    POST /asset/asset-model/import

    Import an AssetModel from a JSON payload.  Accepts the same fields as the
    standard form, but ``vendor`` and ``type`` are provided as **name strings**
    (not IDs) and images are optional **Data URL (base64)** strings.

    Request body (JSON):
    ```json
    {
      "name": "PowerEdge R750",
      "vendor": "Dell",
      "type": "Server",
      "rack_units": 2,
      "note": "...",
      "front_image": "data:image/jpeg;base64,...",
      "rear_image":  "data:image/jpeg;base64,..."
    }
    ```

    Responses:
    - 201: model created, returns AssetModelSerializer data.
    - 400: missing/invalid fields.
    - 409: a model with the same (name, vendor, type) already exists.
    """

    @extend_schema(
        summary='Import an AssetModel from JSON (with optional base64 images)',
        request={
            'application/json': {
                'type': 'object',
                'required': ['name', 'vendor', 'type'],
                'properties': {
                    'name':        {'type': 'string'},
                    'vendor':      {'type': 'string', 'description': 'Vendor name (created if missing)'},
                    'type':        {'type': 'string', 'description': 'AssetType name (created if missing)'},
                    'rack_units':  {'type': 'integer', 'default': 1},
                    'note':        {'type': 'string'},
                    'front_image': {'type': 'string', 'description': 'Data URL (base64) — optional'},
                    'rear_image':  {'type': 'string', 'description': 'Data URL (base64) — optional'},
                },
            }
        },
        responses={
            201: AssetModelSerializer,
            400: OpenApiResponse(description='Missing or invalid fields'),
            409: OpenApiResponse(description='Model already exists'),
        },
        examples=[
            OpenApiExample(
                'PowerEdge R750',
                value={
                    'name': 'PowerEdge R750',
                    'vendor': 'Dell',
                    'type': 'Server',
                    'rack_units': 2,
                    'note': '',
                    'front_image': 'data:image/jpeg;base64,...',
                },
                request_only=True,
            )
        ],
    )
    def post(self, request):
        data = request.data

        # ── Required fields ───────────────────────────────────────────────────
        name = str(data.get('name', '')).strip()
        vendor_name = str(data.get('vendor', '')).strip()
        type_name = str(data.get('type', '')).strip()

        errors = {}
        if not name:
            errors['name'] = 'This field is required.'
        if not vendor_name:
            errors['vendor'] = 'This field is required.'
        if not type_name:
            errors['type'] = 'This field is required.'
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        # ── Resolve FK objects (create if missing) ────────────────────────────
        vendor, _ = Vendor.objects.get_or_create(name=vendor_name)
        asset_type, _ = AssetType.objects.get_or_create(name=type_name)

        # ── Duplicate check ───────────────────────────────────────────────────
        if AssetModel.objects.filter(name=name, vendor=vendor, type=asset_type).exists():
            return Response(
                {
                    'detail': f'A model named "{name}" already exists for {vendor_name} ({type_name}).',
                    'code': 'already_exists',
                },
                status=status.HTTP_409_CONFLICT,
            )

        # ── Build instance ────────────────────────────────────────────────────
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

        # ── Decode images ─────────────────────────────────────────────────────
        front_raw = data.get('front_image')
        rear_raw = data.get('rear_image')

        if front_raw:
            try:
                instance.front_image = _decode_image(front_raw, 'front_image')
            except ValueError as exc:
                return Response({'front_image': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if rear_raw:
            try:
                instance.rear_image = _decode_image(rear_raw, 'rear_image')
            except ValueError as exc:
                return Response({'rear_image': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        instance.save()

        serializer = AssetModelSerializer(
            instance, context={'request': request}
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)
