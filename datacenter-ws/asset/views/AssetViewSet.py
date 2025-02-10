from rest_framework import viewsets
from asset.serializers import AssetSerializer
from asset.models import Asset
from rest_framework import filters
import django_filters.rest_framework
from asset.paginations import StandardResultsSetPagination


class AssetViewSet(viewsets.ModelViewSet):
    """
    AssetViewSet is a viewset for handling CRUD operations on Asset objects.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all Asset objects.
        serializer_class (Serializer): The serializer class used to serialize Asset objects.
        pagination_class (Pagination): The pagination class used to paginate the results.
        search_fields (list): The fields that can be searched using the search filter.
        filter_backends (tuple): The filter backends used for ordering and filtering the results.
        ordering_fields (str): The fields that can be used for ordering the results.
        ordering (list): The default ordering for the results.
        filterset_fields (list): The fields that can be used for filtering the results.
    """
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer
    pagination_class = StandardResultsSetPagination
    search_fields = ['hostname', 'sap_id', 'serial_number', 'order_id']
    filter_backends = (filters.OrderingFilter, filters.SearchFilter,
                       django_filters.rest_framework.DjangoFilterBackend)

    ordering_fields = '__all__'
    ordering = ['hostname']
    filterset_fields = ['hostname', 'sap_id',
                        'serial_number', 'order_id', 'model', 'state', 'model__vendor', 'model__type']
