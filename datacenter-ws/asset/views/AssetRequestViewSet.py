from django.db import transaction
from django.utils.translation import gettext as _
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.audit import log_action
from accounts.models import SecurityAuditLog
from accounts.permissions import (
    ViewRequestsPermission,
    CreateRequestPermission,
    ManageRequestsPermission,
)
from asset.models import AssetRequest, AssetTransitionLog
from asset.models.AssetRequest import AssetRequestStatus, ALLOWED_REQUEST_TRANSITIONS
from asset.serializers import (
    AssetRequestSerializer,
    AssetRequestCreateSerializer,
    AssetRequestPlanSerializer,
    AssetRequestClarifySerializer,
    AssetRequestRejectSerializer,
    AssetRequestResubmitSerializer,
)
from django_filters import rest_framework as df_filters
from shared.mixins import StandardFilterMixin


class AssetRequestFilter(df_filters.FilterSet):
    class Meta:
        model = AssetRequest
        fields = ['asset', 'request_type',
                  'status', 'created_by', 'assigned_to']


class AssetRequestViewSet(
    StandardFilterMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Lifecycle management for asset requests.

    Request lifecycle:
        SUBMITTED → PLANNED → EXECUTED  (normal path)
        SUBMITTED / PLANNED → REJECTED  (rejected)
        SUBMITTED / PLANNED → NEEDS_CLARIFICATION → SUBMITTED  (clarification)

    When a request is EXECUTED, the asset state and location are effectively
    updated and an AssetTransitionLog is created.
    """

    queryset = AssetRequest.objects.select_related(
        'asset', 'from_state', 'to_state',
        'from_room', 'to_room',
        'created_by', 'assigned_to', 'executed_by',
    ).all()
    filterset_class = AssetRequestFilter
    ordering_fields = ['created_at', 'updated_at', 'status', 'planned_date']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), CreateRequestPermission()]
        if self.action in ('plan', 'execute', 'reject', 'request_clarification'):
            return [IsAuthenticated(), ManageRequestsPermission()]
        # resubmit: only the original requester can submit again
        return [IsAuthenticated(), ViewRequestsPermission()]

    def get_serializer_class(self):
        if self.action == 'create':
            return AssetRequestCreateSerializer
        if self.action == 'plan':
            return AssetRequestPlanSerializer
        if self.action == 'request_clarification':
            return AssetRequestClarifySerializer
        if self.action == 'reject':
            return AssetRequestRejectSerializer
        if self.action == 'resubmit':
            return AssetRequestResubmitSerializer
        return AssetRequestSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        log_action(
            self.request,
            SecurityAuditLog.Action.ASSET_REQUEST_CREATE,
            'asset_request',
            resource_id=instance.pk,
            delta_data={'asset_id': instance.asset_id,
                        'request_type': instance.request_type},
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _get_request_or_404(self, pk):
        try:
            return AssetRequest.objects.select_related(
                'asset', 'asset__state', 'asset__room',
                'from_state', 'to_state', 'from_room', 'to_room',
                'created_by', 'assigned_to',
            ).get(pk=pk)
        except AssetRequest.DoesNotExist:
            return None

    def _check_transition(self, asset_request, target_status):
        """Returns None when transition is valid, error Response otherwise."""
        allowed = ALLOWED_REQUEST_TRANSITIONS.get(asset_request.status, set())
        if target_status not in allowed:
            return Response(
                {
                    'error': _('Transition not allowed'),
                    'current_status': asset_request.status,
                    'target_status': target_status,
                    'allowed': sorted(allowed),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    # ── Actions ───────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='plan')
    def plan(self, request, pk=None):
        """
        POST /asset/asset_request/{id}/plan
        Body: { "planned_date": "YYYY-MM-DD", "assigned_to": <int|null>, "notes": "" }

        Transition SUBMITTED → PLANNED.
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Request not found')}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_transition(asset_request, AssetRequestStatus.PLANNED)
        if err:
            return err

        serializer = AssetRequestPlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        asset_request.status = AssetRequestStatus.PLANNED
        if 'planned_date' in data:
            asset_request.planned_date = data['planned_date']
        if 'assigned_to' in data:
            from django.contrib.auth.models import User
            try:
                asset_request.assigned_to = User.objects.get(
                    pk=data['assigned_to']) if data['assigned_to'] else None
            except User.DoesNotExist:
                return Response({'error': _('User not found')}, status=status.HTTP_400_BAD_REQUEST)
        if data.get('notes'):
            asset_request.notes = data['notes']

        asset_request.save()

        log_action(request, SecurityAuditLog.Action.ASSET_REQUEST_PLAN, 'asset_request',
                   resource_id=asset_request.pk,
                   delta_data={'planned_date': str(asset_request.planned_date)})
        return Response(AssetRequestSerializer(asset_request).data)

    @action(detail=True, methods=['post'], url_path='execute')
    def execute(self, request, pk=None):
        """
        POST /asset/asset_request/{id}/execute

        Transition → EXECUTED.
        Applies the requested state/location transition on the asset,
        creates an AssetTransitionLog and marks the request as executed.
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Request not found')}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_transition(
            asset_request, AssetRequestStatus.EXECUTED)
        if err:
            return err

        asset = asset_request.asset

        with transaction.atomic():
            # Create transition log (official history)
            AssetTransitionLog.objects.create(
                asset=asset,
                from_state=asset.state,
                to_state=asset_request.to_state,
                from_room=asset.room,
                to_room=asset_request.to_room,
                user=request.user,
                notes=f'[Richiesta #{asset_request.pk}] {asset_request.notes}',
            )

            # Update asset
            asset.state = asset_request.to_state
            asset.room = asset_request.to_room
            asset.save(update_fields=['state', 'room', 'updated_at'])

            # Close request
            asset_request.status = AssetRequestStatus.EXECUTED
            asset_request.executed_by = request.user
            asset_request.save()

        log_action(request, SecurityAuditLog.Action.ASSET_REQUEST_EXECUTE, 'asset_request',
                   resource_id=asset_request.pk,
                   delta_data={
                       'asset_id': asset.pk,
                       'to_state': asset_request.to_state.code,
                       'to_room': asset_request.to_room_id,
                   })
        return Response(AssetRequestSerializer(asset_request).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """
        POST /asset/asset_request/{id}/reject
        Body: { "rejection_notes": "..." }

        Transition → REJECTED (terminal).
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Request not found')}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_transition(
            asset_request, AssetRequestStatus.REJECTED)
        if err:
            return err

        serializer = AssetRequestRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        asset_request.status = AssetRequestStatus.REJECTED
        asset_request.rejection_notes = serializer.validated_data['rejection_notes']
        asset_request.save()

        log_action(request, SecurityAuditLog.Action.ASSET_REQUEST_REJECT, 'asset_request',
                   resource_id=asset_request.pk,
                   delta_data={'rejection_notes': asset_request.rejection_notes})
        return Response(AssetRequestSerializer(asset_request).data)

    @action(detail=True, methods=['post'], url_path='clarify')
    def request_clarification(self, request, pk=None):
        """
        POST /asset/asset_request/{id}/clarify
        Body: { "clarification_notes": "..." }

        Transition → NEEDS_CLARIFICATION.
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Request not found')}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_transition(
            asset_request, AssetRequestStatus.NEEDS_CLARIFICATION)
        if err:
            return err

        serializer = AssetRequestClarifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        asset_request.status = AssetRequestStatus.NEEDS_CLARIFICATION
        asset_request.clarification_notes = serializer.validated_data['clarification_notes']
        asset_request.save()

        log_action(request, SecurityAuditLog.Action.ASSET_REQUEST_CLARIFY, 'asset_request',
                   resource_id=asset_request.pk)
        return Response(AssetRequestSerializer(asset_request).data)

    @action(detail=True, methods=['post'], url_path='resubmit')
    def resubmit(self, request, pk=None):
        """
        POST /asset/asset_request/{id}/resubmit
        Body: { "notes": "..." }  (optional)

        Transition NEEDS_CLARIFICATION → SUBMITTED.
        Only the original requester can resubmit their own request.
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Request not found')}, status=status.HTTP_404_NOT_FOUND)

        if asset_request.created_by != request.user and not request.user.is_staff:
            return Response(
                {'error': _(
                    'Only the original requester can resubmit the request')},
                status=status.HTTP_403_FORBIDDEN,
            )

        err = self._check_transition(
            asset_request, AssetRequestStatus.SUBMITTED)
        if err:
            return err

        serializer = AssetRequestResubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        asset_request.status = AssetRequestStatus.SUBMITTED
        asset_request.clarification_notes = ''
        if serializer.validated_data.get('notes'):
            asset_request.notes = serializer.validated_data['notes']
        asset_request.save()

        log_action(request, SecurityAuditLog.Action.ASSET_REQUEST_RESUBMIT, 'asset_request',
                   resource_id=asset_request.pk)
        return Response(AssetRequestSerializer(asset_request).data)
