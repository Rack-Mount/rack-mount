from rest_framework import viewsets
from asset.serializers import AssetStateSerializer
from asset.models import AssetState
from shared.mixins import NameSearchMixin
from accounts.mixins import RoleBasedViewSetMixin


class AssetStateViewSet(RoleBasedViewSetMixin, NameSearchMixin, viewsets.ModelViewSet):
    """ViewSet for CRUD operations on AssetState objects."""

    queryset = AssetState.objects.all()
    serializer_class = AssetStateSerializer
