from django.db.models import ProtectedError
from rest_framework import viewsets, status
from rest_framework.response import Response
from asset.serializers import VendorSerializer
from asset.models import Vendor
from shared.mixins import NameSearchMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import CatalogResourcePermission
from accounts.audit import AuditLogMixin
from accounts.models import SecurityAuditLog


class VendorViewSet(AuditLogMixin, NameSearchMixin, viewsets.ModelViewSet):
    audit_resource_type = 'vendor'
    audit_action_create = SecurityAuditLog.Action.CATALOG_CREATE
    audit_action_update = SecurityAuditLog.Action.CATALOG_UPDATE
    audit_action_delete = SecurityAuditLog.Action.CATALOG_DELETE
    """
    VendorViewSet handles CRUD operations on the Vendor model.
    """
    permission_classes = [IsAuthenticated, CatalogResourcePermission]
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    ordering_fields = ['name']

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "vendor_in_use"},
                status=status.HTTP_409_CONFLICT,
            )
