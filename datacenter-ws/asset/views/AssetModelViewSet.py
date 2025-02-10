from rest_framework import viewsets
from asset.serializers import AssetModelSerializer
from asset.models import AssetModel
from rest_framework import filters
import django_filters.rest_framework
from asset.paginations import StandardResultsSetPagination


class AssetModelViewSet(viewsets.ModelViewSet):
    queryset = AssetModel.objects.all()
    serializer_class = AssetModelSerializer
    pagination_class = StandardResultsSetPagination
    search_fields = ['name', 'vendor__name', 'type__name']
    filter_backends = (filters.OrderingFilter, filters.SearchFilter,
                       django_filters.rest_framework.DjangoFilterBackend)

    ordering_fields = ['name', 'vendor', 'type']
    ordering = ['name']
    filterset_fields = ['name', 'vendor', 'type']
