from rest_framework import viewsets
from asset.serializers import AssetCustomFieldSerializer
from asset.models import AssetCustomField
from asset.paginations import StandardResultsSetPagination


class AssetCustomFieldViewSet(viewsets.ModelViewSet):
    queryset = AssetCustomField.objects.all()
    serializer_class = AssetCustomFieldSerializer
    pagination_class = StandardResultsSetPagination
    ordering = ['asset']
    filterset_fields = ['asset']
