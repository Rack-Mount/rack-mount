from rest_framework import viewsets
from asset.serializers import AssetSerializer
from asset.models import Asset
from rest_framework import filters
import django_filters.rest_framework
from asset.paginations import StandardResultsSetPagination


class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer
    pagination_class = StandardResultsSetPagination
    search_fields = ['hostname', 'sap_id', 'serial_number', 'order_id']
    filter_backends = (filters.OrderingFilter, filters.SearchFilter,
                       django_filters.rest_framework.DjangoFilterBackend)

    ordering_fields = '__all__'
    ordering = ['hostname']
    filterset_fields = ['hostname', 'sap_id', 'serial_number', 'order_id']
