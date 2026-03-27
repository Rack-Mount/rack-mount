from rest_framework import viewsets
from location.serializers import RackTypeSerializer
from location.models import RackType
from shared.mixins import NameSearchMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import RackResourcePermission
from accounts.audit import AuditLogMixin
from accounts.models import SecurityAuditLog


class RackTypeViewSet(AuditLogMixin, NameSearchMixin, viewsets.ModelViewSet):
    """ViewSet for CRUD operations on RackType objects."""
    audit_resource_type = 'rack_type'
    audit_action_create = SecurityAuditLog.Action.INFRA_CREATE
    audit_action_update = SecurityAuditLog.Action.INFRA_UPDATE
    audit_action_delete = SecurityAuditLog.Action.INFRA_DELETE

    permission_classes = [IsAuthenticated, RackResourcePermission]

    queryset = RackType.objects.all()
    serializer_class = RackTypeSerializer
    ordering = ['model']
    filterset_fields = ['model']
    search_fields = ['model']
