from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.translation import gettext as _
from django_filters.rest_framework import DjangoFilterBackend
from catalog.serializers import AssetModelSerializer
from catalog.models import AssetModel
from shared.mixins import ImageTransformMixin
from shared.paginations import StandardResultsSetPagination
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import CatalogResourcePermission, DeleteCatalogPermission
from accounts.audit import AuditLogMixin, log_action
from accounts.models import SecurityAuditLog


class AssetModelViewSet(AuditLogMixin, ImageTransformMixin, viewsets.ModelViewSet):
    audit_resource_type = 'asset_model'
    audit_action_create = SecurityAuditLog.Action.CATALOG_CREATE
    audit_action_update = SecurityAuditLog.Action.CATALOG_UPDATE
    audit_action_delete = SecurityAuditLog.Action.CATALOG_DELETE

    permission_classes = [IsAuthenticated, CatalogResourcePermission]

    def get_permissions(self):
        if self.action == 'bulk_delete':
            return [IsAuthenticated(), DeleteCatalogPermission()]
        return [IsAuthenticated(), CatalogResourcePermission()]

    queryset = AssetModel.objects.select_related('vendor', 'type').all()
    serializer_class = AssetModelSerializer
    pagination_class = StandardResultsSetPagination
    search_fields = ['name', 'vendor__name', 'type__name']
    filter_backends = (filters.OrderingFilter, filters.SearchFilter, DjangoFilterBackend)

    ordering_fields = ['name', 'vendor__name', 'type__name', 'rack_units']
    ordering = ['name']
    filterset_fields = ['name', 'vendor', 'type']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        asset_count = instance.assets.count()
        if asset_count:
            return Response(
                {
                    'detail': _('Cannot delete: this model is used by %(count)d asset(s).') % {'count': asset_count},
                    'code': 'in_use',
                    'asset_count': asset_count,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='bulk_delete')
    def bulk_delete(self, request):
        ids = request.data.get('ids')
        if ids is None or not isinstance(ids, list):
            return Response(
                {'error': _('ids must be a list')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset = AssetModel.objects.filter(id__in=ids)
        in_use_ids = set(
            queryset.filter(assets__isnull=False).values_list('id', flat=True)
        )
        to_delete = queryset.exclude(id__in=in_use_ids)
        deleted_count, _ = to_delete.delete()
        log_action(request, SecurityAuditLog.Action.CATALOG_DELETE, 'asset_model',
                   delta_data={'deleted': deleted_count, 'skipped': len(in_use_ids)})
        return Response({'deleted': deleted_count, 'skipped': len(in_use_ids)})
