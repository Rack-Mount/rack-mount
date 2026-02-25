from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.serializers import AssetTypeSerializer
from asset.models import AssetType
from asset.paginations import StandardResultsSetPagination


class AssetTypeViewSet(viewsets.ModelViewSet):
    """
    AssetTypeViewSet is a viewset for handling CRUD operations on AssetType model.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all AssetType objects.
        serializer_class (Serializer): The serializer class used for serializing and deserializing AssetType objects.
        pagination_class (Pagination): The pagination class used for paginating the results.
        filter_backends (tuple): The filter backends used for ordering, searching, and filtering.
        ordering (list): The default ordering for the queryset, ordered by 'name'.
        filterset_fields (list): The fields that can be used to filter the queryset.
        search_fields (list): The fields that can be searched.
    """
    queryset = AssetType.objects.all()
    serializer_class = AssetTypeSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter, filters.SearchFilter, DjangoFilterBackend)
    ordering = ['name']
    filterset_fields = ['name']
    search_fields = ['name']
