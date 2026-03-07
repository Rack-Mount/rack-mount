from rest_framework import viewsets
from asset.serializers import AssetCustomFieldSerializer
from asset.models import AssetCustomField
from shared.mixins import StandardFilterMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import CatalogResourcePermission


class AssetCustomFieldViewSet(StandardFilterMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CatalogResourcePermission]
    queryset = AssetCustomField.objects.select_related(
        'asset', 'field_name'
    ).all()
    serializer_class = AssetCustomFieldSerializer
    ordering = ['asset__hostname', 'field_name__name']
    filterset_fields = ['asset']
    search_fields = ['asset__hostname', 'field_name__name']
