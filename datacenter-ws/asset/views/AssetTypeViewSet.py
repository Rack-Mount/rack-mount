from rest_framework import viewsets
from asset.serializers import AssetTypeSerializer
from asset.models import AssetType
from shared.mixins import NameSearchMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import AssetLookupPermission


class AssetTypeViewSet(NameSearchMixin, viewsets.ModelViewSet):
    """ViewSet for CRUD operations on AssetType objects."""
    permission_classes = [IsAuthenticated, AssetLookupPermission]

    queryset = AssetType.objects.all()
    serializer_class = AssetTypeSerializer
