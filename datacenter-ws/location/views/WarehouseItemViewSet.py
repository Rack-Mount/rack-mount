from decimal import Decimal, InvalidOperation

from django_filters import rest_framework as df_filters
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import RackResourcePermission
from accounts.audit import AuditLogMixin
from accounts.models import SecurityAuditLog
from location.models import WarehouseItem
from location.serializers import WarehouseItemSerializer
from shared.mixins import StandardFilterMixin


class WarehouseItemFilter(df_filters.FilterSet):
    below_threshold = df_filters.BooleanFilter(
        method='filter_below_threshold',
        label='Solo articoli sotto soglia',
    )
    compatible_model = df_filters.NumberFilter(
        method='filter_compatible_model',
        label='Compatibile con AssetModel (id)',
    )

    def filter_below_threshold(self, queryset, name, value):
        if value:
            from django.db.models import F
            return queryset.filter(
                min_threshold__isnull=False,
                quantity__lt=F('min_threshold'),
            )
        return queryset

    def filter_compatible_model(self, queryset, name, value):
        return queryset.filter(compatible_models__id=value)

    class Meta:
        model = WarehouseItem
        fields = ['warehouse', 'category', 'below_threshold', 'compatible_model']


class WarehouseItemViewSet(AuditLogMixin, StandardFilterMixin, viewsets.ModelViewSet):
    audit_resource_type = 'warehouse_item'
    audit_action_create = SecurityAuditLog.Action.INFRA_CREATE
    audit_action_update = SecurityAuditLog.Action.INFRA_UPDATE
    audit_action_delete = SecurityAuditLog.Action.INFRA_DELETE
    permission_classes = [IsAuthenticated, RackResourcePermission]
    queryset = WarehouseItem.objects.select_related('warehouse').prefetch_related('compatible_models__vendor').all()
    serializer_class = WarehouseItemSerializer
    filterset_class = WarehouseItemFilter
    search_fields = ['name', 'specs', 'notes']
    ordering_fields = ['name', 'category', 'quantity', 'updated_at', 'created_at']
    ordering = ['category', 'name']

    @action(detail=True, methods=['post'], url_path='adjust')
    def adjust(self, request, pk=None):
        """
        Adjust quantity by a signed delta.
        Body: { "delta": <number>, "notes": <str optional> }
        Positive delta = restock, negative = withdrawal.
        """
        item = self.get_object()
        raw = request.data.get('delta')
        if raw is None:
            return Response(
                {'delta': 'Questo campo è obbligatorio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            delta = Decimal(str(raw))
        except (InvalidOperation, ValueError):
            return Response(
                {'delta': 'Valore non valido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_qty = item.quantity + delta
        if new_qty < 0:
            return Response(
                {'delta': 'La quantità non può diventare negativa.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.quantity = new_qty
        notes = request.data.get('notes', '')
        if notes:
            item.notes = notes
        item.save(update_fields=['quantity', 'notes', 'updated_at'])

        serializer = self.get_serializer(item)
        return Response(serializer.data)
