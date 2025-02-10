from rest_framework import viewsets
from asset.serializers import AssetStateSerializer
from asset.models import AssetState
from asset.paginations import StandardResultsSetPagination


class AssetStateViewSet(viewsets.ModelViewSet):
    queryset = AssetState.objects.all()
    serializer_class = AssetStateSerializer
    pagination_class = StandardResultsSetPagination
    ordering = ['name']
    filterset_fields = ['name']
