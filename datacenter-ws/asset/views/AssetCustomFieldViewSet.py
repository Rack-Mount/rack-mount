from rest_framework import viewsets
from asset.serializers import AssetCustomFieldSerializer
from asset.models import AssetCustomField
from asset.paginations import StandardResultsSetPagination
from rest_framework import filters


class AssetCustomFieldViewSet(viewsets.ModelViewSet):
    queryset = AssetCustomField.objects.all()
    serializer_class = AssetCustomFieldSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter,)
    ordering = ['asset__hostname', 'field_name__name']
    filterset_fields = ['asset']
