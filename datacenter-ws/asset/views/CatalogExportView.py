"""
CatalogExportView.py

GET /asset/catalog/export

Returns the entire catalog (vendors, asset types, asset models, generic components)
as a single JSON document.  The `asset_models` section includes front/rear images
encoded as base64 Data URLs, so the export can be directly re-imported via the
existing POST /asset/asset-model/import endpoint.
"""
from __future__ import annotations

import base64
import datetime

from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CatalogResourcePermission
from asset.models import AssetModel, Vendor
from asset.models.AssetType import AssetType
from asset.models.GenericComponent import GenericComponent


def _image_to_data_url(image_field) -> str | None:
    """Read an ImageField and return a base64 Data URL, or None if empty."""
    if not image_field:
        return None
    try:
        with image_field.open('rb') as fh:
            raw = fh.read()
        name = (image_field.name or '').lower()
        if name.endswith('.png'):
            mime = 'image/png'
        elif name.endswith('.webp'):
            mime = 'image/webp'
        elif name.endswith('.gif'):
            mime = 'image/gif'
        else:
            mime = 'image/jpeg'
        encoded = base64.b64encode(raw).decode('ascii')
        return f'data:{mime};base64,{encoded}'
    except Exception:
        return None


class CatalogExportView(APIView):
    """
    GET /asset/catalog/export

    Returns the full catalog as a JSON object:
    - ``vendors``          – list of vendor names
    - ``asset_types``      – list of asset-type names
    - ``asset_models``     – list of models with vendor/type resolved to names
                             and images encoded as base64 Data URLs
    - ``generic_components`` – list of generic / consumable components
    """

    # Export is a read-only operation; CatalogResourcePermission allows GET
    # when the user has can_view_catalog.
    permission_classes = [IsAuthenticated, CatalogResourcePermission]

    @extend_schema(
        tags=['asset'],
        summary='Export catalog as JSON',
        responses={
            200: OpenApiResponse(
                description=(
                    'Full catalog JSON including vendors, types, models '
                    '(with base64 images) and generic components.'
                ),
            ),
        },
    )
    def get(self, request):
        # ── Vendors ───────────────────────────────────────────────────────────
        vendors = [
            {'name': name}
            for name in Vendor.objects.values_list('name', flat=True).order_by('name')
        ]

        # ── Asset types ───────────────────────────────────────────────────────
        asset_types = [
            {'name': name}
            for name in AssetType.objects.values_list('name', flat=True).order_by('name')
        ]

        # ── Asset models ──────────────────────────────────────────────────────
        models_qs = (
            AssetModel.objects
            .select_related('vendor', 'type')
            .order_by('vendor__name', 'name')
        )
        asset_models = [
            {
                'name': m.name,
                'vendor': m.vendor.name if m.vendor else '',
                'type': m.type.name if m.type else '',
                'rack_units': m.rack_units,
                'note': m.note or '',
                'front_image': _image_to_data_url(m.front_image),
                'rear_image': _image_to_data_url(m.rear_image),
            }
            for m in models_qs
        ]

        # ── Generic components ────────────────────────────────────────────────
        generic_components = [
            {
                'name': c.name,
                'component_type': c.component_type,
                'rack_units': c.rack_units,
                'note': c.note or '',
            }
            for c in GenericComponent.objects.order_by('name')
        ]

        return Response({
            'version': 1,
            'exported_at': datetime.datetime.utcnow().replace(
                microsecond=0
            ).isoformat() + 'Z',
            'vendors': vendors,
            'asset_types': asset_types,
            'asset_models': asset_models,
            'generic_components': generic_components,
        })
