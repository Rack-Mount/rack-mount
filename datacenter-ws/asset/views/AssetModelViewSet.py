from rest_framework import viewsets, status
from rest_framework.response import Response
from asset.serializers import AssetModelSerializer
from asset.models import AssetModel
from rest_framework import filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.paginations import StandardResultsSetPagination


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

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.assets.exists():
            asset_count = instance.assets.count()
            return Response(
                {
                    'detail': (
                        f'Impossibile eliminare: questo modello è utilizzato da '
                        f'{asset_count} asset.'
                    ),
                    'code': 'in_use',
                    'asset_count': asset_count,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)
