from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from accounts.audit import AuditLogMixin
from accounts.models import SecurityAuditLog
from accounts.permissions import AssetResourcePermission
from asset.models.AssetNetworkInterface import AssetNetworkInterface
from asset.serializers.AssetNetworkInterfaceSerializer import AssetNetworkInterfaceSerializer
from shared.paginations import StandardResultsSetPagination


class AssetNetworkInterfaceViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    CRUD for per-asset network interfaces.

    Filter by asset: GET /asset/network_interface?asset=<id>
    """
    audit_resource_type = 'asset_network_interface'
    audit_action_create = SecurityAuditLog.Action.ASSET_UPDATE
    audit_action_update = SecurityAuditLog.Action.ASSET_UPDATE
    audit_action_delete = SecurityAuditLog.Action.ASSET_UPDATE

    permission_classes = [IsAuthenticated, AssetResourcePermission]

    queryset = AssetNetworkInterface.objects.select_related('asset').all()
    serializer_class = AssetNetworkInterfaceSerializer
    pagination_class = StandardResultsSetPagination

    filter_backends = (filters.OrderingFilter, DjangoFilterBackend)
    filterset_fields = ['asset']
    ordering_fields = ['name', 'media_type', 'speed', 'port_count']
    ordering = ['name']
