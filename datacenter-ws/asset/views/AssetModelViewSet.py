from rest_framework import viewsets
from asset.serializers import AssetModelSerializer
from asset.models import AssetModel
from rest_framework import filters
import django_filters.rest_framework
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
    queryset = AssetModel.objects.all()
    serializer_class = AssetModelSerializer
    pagination_class = StandardResultsSetPagination
    search_fields = ['name', 'vendor__name', 'type__name']
    filter_backends = (filters.OrderingFilter, filters.SearchFilter,
                       django_filters.rest_framework.DjangoFilterBackend)

    ordering_fields = ['name', 'vendor', 'type']
    ordering = ['name']
    filterset_fields = ['name', 'vendor', 'type']
