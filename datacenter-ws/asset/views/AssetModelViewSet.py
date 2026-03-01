from rest_framework import viewsets, status
from rest_framework.response import Response
from django.utils.translation import gettext as _
from asset.serializers import AssetModelSerializer
from asset.models import AssetModel
from rest_framework import filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.paginations import StandardResultsSetPagination
from asset.utils.image_processing import apply_transforms


class AssetModelViewSet(viewsets.ModelViewSet):
    """
    AssetModelViewSet is a viewset for handling CRUD operations on AssetModel objects.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all AssetModel objects.
        serializer_class (Serializer): The serializer class used for serializing and deserializing AssetModel objects.
        pagination_class (Pagination): The pagination class used for paginating the results.
        search_fields (list): The fields that can be searched using the search filter.
        filter_backends (tuple): The filter backends used for filtering and ordering the results.
        ordering_fields (list): The fields that can be used for ordering the results.
        ordering (list): The default ordering for the results.
        filterset_fields (list): The fields that can be used for filtering the results.
    """
    queryset = AssetModel.objects.select_related('vendor', 'type').all()
    serializer_class = AssetModelSerializer
    pagination_class = StandardResultsSetPagination
    search_fields = ['name', 'vendor__name', 'type__name']
    filter_backends = (filters.OrderingFilter, filters.SearchFilter,
                       DjangoFilterBackend)

    ordering_fields = ['name', 'vendor__name', 'type__name', 'rack_units']
    ordering = ['name']
    filterset_fields = ['name', 'vendor', 'type']

    # ── Transform helper ──────────────────────────────────────────────────────

    def _apply_image_transforms(self, serializer) -> None:
        """
        Pop the *_transform JSON fields from serializer.validated_data in-place,
        apply server-side processing to the corresponding image uploads.
        If no new file was uploaded but a transform was sent, fall back to the
        existing stored file on the instance (edit-existing-image case).
        Must be called before serializer.save().
        """
        vd = serializer.validated_data
        for side in ('front', 'rear'):
            transform_key = f'{side}_image_transform'
            image_key = f'{side}_image'
            params = vd.pop(transform_key, None)
            if not params:
                continue
            upload = vd.get(image_key)
            if not upload and serializer.instance:
                # No new file uploaded — use existing stored image
                existing = getattr(serializer.instance, image_key, None)
                if existing and existing.name:
                    existing.open('rb')
                    upload = existing
            if upload:
                vd[image_key] = apply_transforms(upload, params)

    # ── Override perform_create / perform_update ──────────────────────────────

    def perform_create(self, serializer):
        self._apply_image_transforms(serializer)
        serializer.save()

    def perform_update(self, serializer):
        self._apply_image_transforms(serializer)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.assets.exists():
            asset_count = instance.assets.count()
            return Response(
                {
                    'detail': _('Cannot delete: this model is used by %(count)d asset(s).') % {'count': asset_count},
                    'code': 'in_use',
                    'asset_count': asset_count,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)
