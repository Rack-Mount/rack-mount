from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.serializers import AssetStateSerializer
from asset.models import AssetState
from asset.paginations import StandardResultsSetPagination


class AssetStateViewSet(viewsets.ModelViewSet):
    """
    AssetStateViewSet is a viewset for handling CRUD operations on AssetState objects.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all AssetState objects.
        serializer_class (Serializer): The serializer class used to serialize and deserialize AssetState objects.
        pagination_class (Pagination): The pagination class used to paginate the results.
        filter_backends (tuple): The filter backends used for ordering, searching, and filtering.
        ordering (list): The default ordering for the queryset, ordered by 'name'.
        filterset_fields (list): The fields that can be used to filter the queryset.
        search_fields (list): The fields that can be searched.
    """
    queryset = AssetState.objects.all()
    serializer_class = AssetStateSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter, filters.SearchFilter, DjangoFilterBackend)
    ordering = ['name']
    filterset_fields = ['name']
    search_fields = ['name']
