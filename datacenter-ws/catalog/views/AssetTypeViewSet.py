from rest_framework import viewsets
from catalog.serializers import AssetTypeSerializer
from catalog.models import AssetType
from shared.mixins import NameSearchMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import AssetLookupPermission


class AssetTypeViewSet(NameSearchMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, AssetLookupPermission]

    queryset = AssetType.objects.all()
    serializer_class = AssetTypeSerializer
