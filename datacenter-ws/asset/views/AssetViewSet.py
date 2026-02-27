from rest_framework import viewsets
from asset.serializers import AssetSerializer
from asset.models import Asset
from rest_framework import filters
from django_filters import rest_framework as df_filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.paginations import StandardResultsSetPagination
from rest_framework import permissions


class AssetFilter(df_filters.FilterSet):
    not_in_rack = df_filters.BooleanFilter(
        method='filter_not_in_rack',
        label='Apparati non installati in rack'
    )

    def filter_not_in_rack(self, queryset, name, value):
        if value:
            return queryset.filter(rackunit__isnull=True)
        return queryset

    class Meta:
        model = Asset
        fields = ['hostname', 'sap_id', 'serial_number', 'order_id',
                  'model', 'state', 'model__vendor', 'model__type']


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
    queryset = Asset.objects.select_related(
        'model', 'model__vendor', 'model__type', 'state'
    ).all()
    serializer_class = AssetSerializer
    pagination_class = StandardResultsSetPagination
    search_fields = ['hostname', 'sap_id', 'serial_number', 'order_id',
                     'model__name', 'model__vendor__name']
    filter_backends = (filters.OrderingFilter, filters.SearchFilter,
                       DjangoFilterBackend)
    filterset_class = AssetFilter
    ordering_fields = '__all__'
    ordering = ['hostname']
    # permission_classes = [permissions.IsAuthenticatedOrReadOnly]
