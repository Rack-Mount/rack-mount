from rest_framework import viewsets
from asset.serializers import AssetSerializer
from asset.models import Asset
from rest_framework.pagination import PageNumberPagination
from rest_framework import filters
from django_filters.rest_framework import DjangoFilterBackend
import django_filters.rest_framework


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 5
    page_size_query_param = 'page_size'
    max_page_size = 100


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
