from rest_framework import viewsets
from catalog.serializers import AssetTypeSerializer
from catalog.models import AssetType
from shared.mixins import NameSearchMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import AssetLookupPermission
from accounts.audit import AuditLogMixin
from accounts.models import SecurityAuditLog


class AssetTypeViewSet(AuditLogMixin, NameSearchMixin, viewsets.ModelViewSet):
    audit_resource_type = 'asset_type'
    audit_action_create = SecurityAuditLog.Action.CATALOG_CREATE
    audit_action_update = SecurityAuditLog.Action.CATALOG_UPDATE
    audit_action_delete = SecurityAuditLog.Action.CATALOG_DELETE

    permission_classes = [IsAuthenticated, AssetLookupPermission]

    queryset = AssetType.objects.all()
    serializer_class = AssetTypeSerializer
