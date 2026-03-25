from uuid import uuid4

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.translation import gettext as _
from asset.serializers import AssetSerializer, AssetTransitionLogSerializer
from asset.models import Asset, AssetState, AssetTransitionLog, RackUnit
from location.models import Room
from django_filters import rest_framework as df_filters
from shared.mixins import StandardFilterMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import (
    AssetResourcePermission,
    CloneAssetPermission,
    DeleteAssetPermission,
    EditAssetPermission,
)
from accounts.audit import AuditLogMixin, log_action
from accounts.models import SecurityAuditLog


class AssetFilter(df_filters.FilterSet):
    not_in_rack = df_filters.BooleanFilter(
        method='filter_not_in_rack',
        label='Apparati non installati in rack'
    )

    def filter_not_in_rack(self, queryset, name, value):
        if value:
            return queryset.filter(rackunit__isnull=True)
        return queryset

    class Meta:
        model = Asset
        fields = ['hostname', 'sap_id', 'serial_number', 'order_id',
                  'model', 'state', 'model__vendor', 'model__type']


class AssetViewSet(AuditLogMixin, StandardFilterMixin, viewsets.ModelViewSet):
    audit_resource_type = 'asset'
    audit_action_create = SecurityAuditLog.Action.ASSET_CREATE
    audit_action_update = SecurityAuditLog.Action.ASSET_UPDATE
    audit_action_delete = SecurityAuditLog.Action.ASSET_DELETE
    """
    AssetViewSet is a viewset for handling CRUD operations on Asset objects.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all Asset objects.
        serializer_class (Serializer): The serializer class used to serialize Asset objects.
        pagination_class (Pagination): The pagination class used to paginate the results.
        search_fields (list): The fields that can be searched using the search filter.
        filter_backends (tuple): The filter backends used for ordering and filtering the results.
        ordering_fields (str): The fields that can be used for ordering the results.
        ordering (list): The default ordering for the results.
        filterset_fields (list): The fields that can be used for filtering the results.
    """
    permission_classes = [IsAuthenticated, AssetResourcePermission]

    def get_permissions(self):
        if self.action in ('clone', 'bulk_clone'):
            return [IsAuthenticated(), CloneAssetPermission()]
        if self.action == 'bulk_state':
            return [IsAuthenticated(), EditAssetPermission()]
        if self.action == 'bulk_delete':
            return [IsAuthenticated(), DeleteAssetPermission()]
        return [IsAuthenticated(), AssetResourcePermission()]

    queryset = Asset.objects.select_related(
        'model', 'model__vendor', 'model__type', 'state', 'rackunit__rack', 'room'
    ).all()
    serializer_class = AssetSerializer
    search_fields = ['hostname', 'sap_id', 'serial_number', 'order_id',
                     'model__name', 'model__vendor__name']
    filterset_class = AssetFilter
    ordering_fields = [
        'hostname', 'serial_number', 'sap_id', 'order_id',
        'updated_at', 'created_at',
        'model__name', 'model__vendor__name', 'model__type__name',
        'state__name',
    ]
    ordering = ['hostname']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if RackUnit.objects.filter(device=instance).exists():
            return Response(
                {"detail": "asset_mounted", "code": "mounted"},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['patch'], url_path='bulk_state')
    def bulk_state(self, request):
        """
        PATCH /asset/asset/bulk_state?search=...&state=...&model__type=...
        Body: { "state_id": <int> }

        Updates the state of ALL assets matching the current filter params.
        Returns: { "updated": <int> }
        """
        state_id = request.data.get('state_id')
        if state_id is None:
            return Response(
                {'error': _('state_id is required')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            state_id = int(state_id)
        except (TypeError, ValueError):
            return Response(
                {'error': _('Invalid state_id')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not AssetState.objects.filter(pk=state_id).exists():
            return Response(
                {'error': _('Invalid state_id')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset = self.filter_queryset(self.get_queryset())
        updated_count = queryset.update(state_id=state_id)
        log_action(request, SecurityAuditLog.Action.ASSET_BULK_STATE, 'asset',
                   delta_data={'state_id': state_id, 'updated': updated_count})
        return Response({'updated': updated_count})

    # ── Helper ────────────────────────────────────────────────────────────────
    @staticmethod
    def _clone_asset(original: Asset) -> Asset:
        """Create and save a copy of *original*, generating unique placeholder values
        for the fields that carry a UNIQUE constraint (serial_number, sap_id)."""
        suffix = uuid4().hex[:8].upper()
        clone = Asset(
            hostname=f"(CLONE) {original.hostname}",
            model=original.model,
            serial_number=f"CLONE-{suffix}",
            sap_id=f"CLONE-{suffix}",
            order_id=original.order_id,
            purchase_date=original.purchase_date,
            state=original.state,
            decommissioned_date=original.decommissioned_date,
            warranty_expiration=original.warranty_expiration,
            support_expiration=original.support_expiration,
            power_supplies=original.power_supplies,
            power_consumption_watt=original.power_consumption_watt,
            note=original.note,
        )
        clone.save()
        return clone

    # ── Single-asset clone ────────────────────────────────────────────────────
    @action(detail=True, methods=['post'], url_path='clone')
    def clone(self, request, pk=None):
        """
        POST /asset/asset/{id}/clone
        Creates a copy of the given asset (unique fields get CLONE-* placeholders).
        Returns the newly created asset.
        """
        original = self.get_object()
        clone = self._clone_asset(original)
        log_action(request, SecurityAuditLog.Action.ASSET_CLONE, 'asset',
                   resource_id=clone.pk, delta_data={'source_id': original.pk})
        serializer = self.get_serializer(clone)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # ── Bulk clone ────────────────────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='bulk_clone')
    def bulk_clone(self, request):
        """
        POST /asset/asset/bulk_clone
        Body: { "ids": [1, 2, 3] }
        Clones each listed asset.
        Returns: { "created": <int> }
        """
        ids = request.data.get('ids', [])
        if not ids or not isinstance(ids, list):
            return Response(
                {'error': _('ids must be a non-empty list')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assets = Asset.objects.filter(id__in=ids)
        created = 0
        errors = []
        for asset in assets:
            try:
                self._clone_asset(asset)
                created += 1
            except Exception as exc:
                errors.append({'id': asset.id, 'error': str(exc)})
        response_data = {'created': created}
        if errors:
            response_data['errors'] = errors
            return Response(response_data, status=status.HTTP_207_MULTI_STATUS)
        return Response(response_data)

    # ── Move (state + room transition) ───────────────────────────────────────
    @action(detail=True, methods=['post'], url_path='move')
    def move(self, request, pk=None):
        """
        POST /asset/asset/{id}/move
        Body: { "to_state": <int>, "to_room": <int|null>, "notes": "" }

        Records a state/location transition for the asset and updates it in place.
        """
        asset = self.get_object()

        to_state_id = request.data.get('to_state')
        to_room_id = request.data.get('to_room')
        notes = request.data.get('notes', '')

        if to_state_id is None:
            return Response(
                {'error': _('to_state is required')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            to_state = AssetState.objects.get(pk=to_state_id)
        except AssetState.DoesNotExist:
            return Response(
                {'error': _('Invalid to_state')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        to_room = None
        if to_room_id is not None:
            try:
                to_room = Room.objects.get(pk=to_room_id)
            except Room.DoesNotExist:
                return Response(
                    {'error': _('Invalid to_room')},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        AssetTransitionLog.objects.create(
            asset=asset,
            from_state=asset.state,
            to_state=to_state,
            from_room=asset.room,
            to_room=to_room,
            user=request.user,
            notes=notes,
        )

        asset.state = to_state
        asset.room = to_room
        asset.save(update_fields=['state', 'room', 'updated_at'])

        serializer = self.get_serializer(asset)
        return Response(serializer.data)

    # ── Transition history ────────────────────────────────────────────────────
    @action(detail=True, methods=['get'], url_path='history')
    def history(self, request, pk=None):
        """
        GET /asset/asset/{id}/history
        Returns the ordered transition log for this asset.
        """
        asset = self.get_object()
        qs = AssetTransitionLog.objects.filter(asset=asset).select_related(
            'from_state', 'to_state', 'from_room', 'to_room', 'user'
        )
        serializer = AssetTransitionLogSerializer(qs, many=True)
        return Response(serializer.data)

    # ── Bulk delete ───────────────────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='bulk_delete')
    def bulk_delete(self, request):
        """
        POST /asset/asset/bulk_delete
        Body: { "ids": [1, 2, 3] }   → delete those specific assets
              {}  + filter params    → delete all assets matching current filters

        Assets currently mounted in a rack are skipped.
        Returns: { "deleted": <int>, "skipped": <int> }
        """
        ids = request.data.get('ids')
        if ids is not None:
            if not isinstance(ids, list):
                return Response(
                    {'error': _('ids must be a list')},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = Asset.objects.filter(id__in=ids)
        else:
            queryset = self.filter_queryset(self.get_queryset())

        mounted_ids = set(
            RackUnit.objects.filter(device__in=queryset)
            .values_list('device_id', flat=True)
        )
        to_delete = queryset.exclude(id__in=mounted_ids)
        deleted_count, _ = to_delete.delete()
        log_action(request, SecurityAuditLog.Action.ASSET_BULK_DELETE, 'asset',
                   delta_data={'deleted': deleted_count, 'skipped': len(mounted_ids)})
        return Response({'deleted': deleted_count, 'skipped': len(mounted_ids)})
