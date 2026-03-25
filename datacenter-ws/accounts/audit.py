"""
Audit log helpers for CRUD operations.

Usage in a ViewSet:

    from accounts.audit import AuditLogMixin
    from accounts.models import SecurityAuditLog

    class MyViewSet(AuditLogMixin, viewsets.ModelViewSet):
        audit_resource_type = 'asset'
        audit_action_create = SecurityAuditLog.Action.ASSET_CREATE
        audit_action_update = SecurityAuditLog.Action.ASSET_UPDATE
        audit_action_delete = SecurityAuditLog.Action.ASSET_DELETE
"""

import logging

from accounts.models import SecurityAuditLog

logger = logging.getLogger(__name__)


def _get_client_ip(request) -> str | None:
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def log_action(
    request,
    action: str,
    resource_type: str,
    resource_id: str = '',
    delta_data: dict | None = None,
) -> None:
    """Write a single SecurityAuditLog row. Never raises — failures are logged only."""
    try:
        SecurityAuditLog.objects.create(
            user=request.user if request.user.is_authenticated else None,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            delta_data=delta_data or {},
            ip_address=_get_client_ip(request),
        )
    except Exception:
        logger.exception(
            'Failed to write audit log entry (action=%s resource_type=%s resource_id=%s)',
            action, resource_type, resource_id,
        )


class AuditLogMixin:
    """
    ViewSet mixin that writes a SecurityAuditLog entry after each successful
    create, update, or destroy operation.

    Subclasses must set:
        audit_resource_type  str  — e.g. 'asset', 'vendor', 'rack'
        audit_action_create  str  — SecurityAuditLog.Action value (or '' to skip)
        audit_action_update  str
        audit_action_delete  str
    """

    audit_resource_type: str = ''
    audit_action_create: str = ''
    audit_action_update: str = ''
    audit_action_delete: str = ''

    def _audit_id(self, instance) -> str:
        return str(getattr(instance, 'pk', ''))

    def perform_create(self, serializer):
        super().perform_create(serializer)
        if self.audit_action_create:
            log_action(
                self.request,
                self.audit_action_create,
                self.audit_resource_type,
                resource_id=self._audit_id(serializer.instance),
            )

    def perform_update(self, serializer):
        super().perform_update(serializer)
        if self.audit_action_update:
            log_action(
                self.request,
                self.audit_action_update,
                self.audit_resource_type,
                resource_id=self._audit_id(serializer.instance),
            )

    def perform_destroy(self, instance):
        resource_id = self._audit_id(instance)
        super().perform_destroy(instance)
        # Log only after a successful delete (no exception raised above)
        if self.audit_action_delete:
            log_action(
                self.request,
                self.audit_action_delete,
                self.audit_resource_type,
                resource_id=resource_id,
            )
