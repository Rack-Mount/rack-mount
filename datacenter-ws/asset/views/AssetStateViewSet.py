from rest_framework import viewsets
from asset.serializers import AssetStateSerializer
from asset.models import AssetState
from shared.mixins import NameSearchMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import CatalogResourcePermission


class AssetStateViewSet(NameSearchMixin, viewsets.ModelViewSet):
    """ViewSet for CRUD operations on AssetState objects."""
    permission_classes = [IsAuthenticated, CatalogResourcePermission]

    queryset = AssetState.objects.all()
    serializer_class = AssetStateSerializer
