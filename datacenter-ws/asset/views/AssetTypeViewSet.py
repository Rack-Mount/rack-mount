from rest_framework import viewsets
from asset.serializers import AssetTypeSerializer
from asset.models import AssetType
from shared.mixins import NameSearchMixin


class AssetTypeViewSet(NameSearchMixin, viewsets.ModelViewSet):
    """ViewSet for CRUD operations on AssetType objects."""

    queryset = AssetType.objects.all()
    serializer_class = AssetTypeSerializer
