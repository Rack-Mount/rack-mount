from rest_framework import viewsets
from asset.serializers import AssetTypeSerializer
from asset.models import AssetType
from asset.paginations import StandardResultsSetPagination


class AssetTypeViewSet(viewsets.ModelViewSet):
    queryset = AssetType.objects.all()
    serializer_class = AssetTypeSerializer
    pagination_class = StandardResultsSetPagination
    ordering = ['name']
    filterset_fields = ['name']
