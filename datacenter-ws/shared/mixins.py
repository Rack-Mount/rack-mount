"""
Shared ViewSet mixins used across the asset and location apps.

StandardFilterMixin
    Sets the canonical pagination class and filter backends used by all API
    ViewSets. Extend this for any ViewSet that defines its own
    search/filter/ordering fields.

NameSearchMixin
    Extends StandardFilterMixin with name-based filtering, searching and
    ordering for simple lookup-table ViewSets (AssetState, AssetType, Vendor, …).

ImageTransformMixin
    Handles server-side image transforms for ViewSets that accept
    front_image / rear_image uploads together with *_transform JSON params.
"""

from rest_framework import filters
from django_filters.rest_framework import DjangoFilterBackend

from shared.paginations import StandardResultsSetPagination
from asset.utils.image_processing import apply_transforms


class StandardFilterMixin:
    """
    Sets the canonical ``pagination_class`` and ``filter_backends`` for every
    API ViewSet.  Extend this mixin (directly or via ``NameSearchMixin``) to
    avoid repeating these two lines in every class.
    """

    pagination_class = StandardResultsSetPagination
    filter_backends = (
        filters.OrderingFilter,
        filters.SearchFilter,
        DjangoFilterBackend,
    )


class NameSearchMixin(StandardFilterMixin):
    """Shared configuration for name-based lookup-table ViewSets."""

    ordering = ['name']
    filterset_fields = ['name']
    search_fields = ['name']


class ImageTransformMixin:
    """
    Applies server-side image transforms to front_image / rear_image before
    saving.

    Pop the ``*_transform`` JSON fields from ``serializer.validated_data``
    in-place, apply the processing pipeline to the corresponding upload.
    If no new file was provided but a transform was sent, fall back to the
    existing stored file on the instance (edit-without-re-upload case).
    """

    def _apply_image_transforms(self, serializer) -> None:
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
