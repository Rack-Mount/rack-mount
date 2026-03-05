from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.models import GenericComponent
from asset.serializers import GenericComponentSerializer
from asset.paginations import StandardResultsSetPagination
from asset.utils.image_processing import apply_transforms


class GenericComponentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing GenericComponent objects (cable managers, blanking panels,
    patch panels, PDUs, shelves, and other consumable rack accessories).

    Supports standard CRUD operations, filtering, ordering and searching.
    Accepts multipart/form-data with optional front_image / rear_image file uploads
    and corresponding *_transform JSON for server-side crop/rotate processing.
    """

    queryset = GenericComponent.objects.all()
    serializer_class = GenericComponentSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter,
                       filters.SearchFilter, DjangoFilterBackend)
    filterset_fields = ['component_type']
    search_fields = ['name', 'note']
    ordering_fields = ['name', 'component_type', 'rack_units', 'created_at']

    # ── Image transform helper ─────────────────────────────────────────────────

    def _apply_image_transforms(self, serializer) -> None:
        """Mirror of AssetModelViewSet._apply_image_transforms."""
        vd = serializer.validated_data
        for side in ('front', 'rear'):
            transform_key = f'{side}_image_transform'
            image_key = f'{side}_image'
            params = vd.pop(transform_key, None)
            if not params:
                continue
            upload = vd.get(image_key)
            if not upload and serializer.instance:
                existing = getattr(serializer.instance, image_key, None)
                if existing and existing.name:
                    existing.open('rb')
                    upload = existing
            if upload:
                vd[image_key] = apply_transforms(upload, params)

    def perform_create(self, serializer):
        self._apply_image_transforms(serializer)
        serializer.save()

    def perform_update(self, serializer):
        self._apply_image_transforms(serializer)
        serializer.save()
