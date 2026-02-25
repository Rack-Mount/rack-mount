from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.serializers import AssetCustomFieldSerializer
from asset.models import AssetCustomField
from asset.paginations import StandardResultsSetPagination


class AssetCustomFieldViewSet(viewsets.ModelViewSet):
    queryset = AssetCustomField.objects.select_related(
        'asset', 'field_name'
    ).all()
    serializer_class = AssetCustomFieldSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter, filters.SearchFilter, DjangoFilterBackend)
    ordering = ['asset__hostname', 'field_name__name']
    filterset_fields = ['asset']
    search_fields = ['asset__hostname', 'field_name__name']
