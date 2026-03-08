from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import CatalogResourcePermission
from asset.serializers.AssetModelPortSerializer import AssetModelPortSerializer
from asset.models.AssetModelPort import AssetModelPort
from shared.paginations import StandardResultsSetPagination


class AssetModelPortViewSet(viewsets.ModelViewSet):
    """
    CRUD viewset for AssetModelPort.

    Supports filtering by asset_model so the frontend can load
    all ports for a given model: GET /asset/asset_model_port?asset_model=<id>
    """
    permission_classes = [IsAuthenticated, CatalogResourcePermission]

    queryset = AssetModelPort.objects.select_related('asset_model').all()
    serializer_class = AssetModelPortSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter, DjangoFilterBackend)
    filterset_fields = ['asset_model']
    ordering_fields = ['side', 'name', 'port_type']
    ordering = ['side', 'name']
