"""
CatalogImportView.py

POST /asset/catalog/import

Accepts the full catalog JSON produced by GET /asset/catalog/export and
bulk-creates any missing records.  Existing rows are skipped (no overwrite).

Request body:
  The same structure returned by the export endpoint:
  {
    "vendors":            [{"name": "Dell"}, ...],
    "asset_types":        [{"name": "Server"}, ...],
    "asset_models":       [{"name": "...", "vendor": "...", "type": "...",
                            "rack_units": 2, "note": "",
                            "front_image": "data:image/jpeg;base64,...",
                            "rear_image":  null}, ...],
    "generic_components": [{"name": "...", "component_type": "...",
                            "rack_units": 1, "note": ""}, ...]
  }

Response 200:
  {
    "vendors":            {"created": N, "skipped": N},
    "asset_types":        {"created": N, "skipped": N},
    "asset_models":       {"created": N, "skipped": N,
                           "errors": [{"index": i, "message": "..."}]},
    "generic_components": {"created": N, "skipped": N,
                           "errors": [{"index": i, "message": "..."}]}
  }
"""
from __future__ import annotations

from django.utils.translation import gettext as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ImportCatalogPermission
from asset.models import AssetModel, Vendor
from asset.models.AssetType import AssetType
from asset.models.GenericComponent import GenericComponent
from asset.views.AssetModelImportView import _decode_image

# Valid component_type choices drawn from GenericComponent.COMPONENT_TYPE_CHOICES
_VALID_COMPONENT_TYPES = {
    'cable_manager', 'blanking_panel', 'patch_panel', 'pdu', 'shelf', 'other',
}


def _summary(created: int, skipped: int, errors: list | None = None) -> dict:
    d: dict = {'created': created, 'skipped': skipped}
    if errors is not None:
        d['errors'] = errors
    return d


class CatalogImportView(APIView):
    """POST /asset/catalog/import — bulk-import a full catalog JSON."""

    permission_classes = [IsAuthenticated, ImportCatalogPermission]

    @extend_schema(
        tags=['asset'],
        summary='Import full catalog from JSON',
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'vendors': {
                        'type': 'array',
                        'items': {'type': 'object', 'properties': {'name': {'type': 'string'}}},
                    },
                    'asset_types': {
                        'type': 'array',
                        'items': {'type': 'object', 'properties': {'name': {'type': 'string'}}},
                    },
                    'asset_models': {'type': 'array', 'items': {'type': 'object'}},
                    'generic_components': {'type': 'array', 'items': {'type': 'object'}},
                },
            }
        },
        responses={
            200: OpenApiResponse(description='Import summary'),
            400: OpenApiResponse(description='Invalid payload format'),
        },
    )
    def post(self, request):
        data = request.data
        if not isinstance(data, dict):
            return Response(
                {'detail': _('Expected a JSON object.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Vendors ───────────────────────────────────────────────────────────
        vendors_created = vendors_skipped = 0
        for item in data.get('vendors') or []:
            name = str(item.get('name', '')).strip()
            if not name:
                continue
            _, created = Vendor.objects.get_or_create(name=name)
            if created:
                vendors_created += 1
            else:
                vendors_skipped += 1

        # ── Asset types ───────────────────────────────────────────────────────
        types_created = types_skipped = 0
        for item in data.get('asset_types') or []:
            name = str(item.get('name', '')).strip()
            if not name:
                continue
            _, created = AssetType.objects.get_or_create(name=name)
            if created:
                types_created += 1
            else:
                types_skipped += 1

        # ── Asset models ──────────────────────────────────────────────────────
        models_created = models_skipped = 0
        model_errors: list[dict] = []

        for idx, item in enumerate(data.get('asset_models') or []):
            name = str(item.get('name', '')).strip()
            vendor_name = str(item.get('vendor', '')).strip()
            type_name = str(item.get('type', '')).strip()

            if not name or not vendor_name or not type_name:
                model_errors.append({
                    'index': idx,
                    'message': _('name, vendor and type are required.'),
                })
                continue

            vendor, _ = Vendor.objects.get_or_create(name=vendor_name)
            asset_type, _ = AssetType.objects.get_or_create(name=type_name)

            if AssetModel.objects.filter(name=name, vendor=vendor, type=asset_type).exists():
                models_skipped += 1
                continue

            try:
                rack_units = max(1, int(item.get('rack_units') or 1))
            except (ValueError, TypeError):
                rack_units = 1

            instance = AssetModel(
                name=name,
                vendor=vendor,
                type=asset_type,
                rack_units=rack_units,
                note=str(item.get('note') or ''),
            )

            front_raw = item.get('front_image')
            rear_raw = item.get('rear_image')

            if front_raw:
                try:
                    instance.front_image = _decode_image(
                        front_raw, 'front_image')
                except ValueError as exc:
                    model_errors.append({'index': idx, 'message': str(exc)})
                    continue

            if rear_raw:
                try:
                    instance.rear_image = _decode_image(rear_raw, 'rear_image')
                except ValueError as exc:
                    model_errors.append({'index': idx, 'message': str(exc)})
                    continue

            instance.save()
            models_created += 1

        # ── Generic components ────────────────────────────────────────────────
        components_created = components_skipped = 0
        component_errors: list[dict] = []

        for idx, item in enumerate(data.get('generic_components') or []):
            name = str(item.get('name', '')).strip()
            if not name:
                component_errors.append({
                    'index': idx,
                    'message': _('name is required.'),
                })
                continue

            component_type = str(item.get('component_type') or 'other').strip()
            if component_type not in _VALID_COMPONENT_TYPES:
                component_type = 'other'

            try:
                rack_units = max(1, int(item.get('rack_units') or 1))
            except (ValueError, TypeError):
                rack_units = 1

            if GenericComponent.objects.filter(name=name).exists():
                components_skipped += 1
                continue

            GenericComponent.objects.create(
                name=name,
                component_type=component_type,
                rack_units=rack_units,
                note=str(item.get('note') or ''),
            )
            components_created += 1

        return Response({
            'vendors':            _summary(vendors_created, vendors_skipped),
            'asset_types':        _summary(types_created, types_skipped),
            'asset_models':       _summary(models_created, models_skipped, model_errors),
            'generic_components': _summary(components_created, components_skipped, component_errors),
        })
