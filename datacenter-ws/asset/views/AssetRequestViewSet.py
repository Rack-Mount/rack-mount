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
        fields = ['asset', 'request_type', 'status', 'created_by', 'assigned_to']


class AssetRequestViewSet(
    StandardFilterMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Gestione delle richieste di ciclo di vita degli asset.

    Ciclo di vita di una richiesta:
        INSERITA → PIANIFICATA → EVASA  (percorso normale)
        INSERITA / PIANIFICATA → RIFIUTATA  (rifiuto)
        INSERITA / PIANIFICATA → IN_CHIARIMENTO → INSERITA  (chiarimento)

    Quando una richiesta viene EVASA, l'asset cambia effettivamente stato e
    location, e viene creato un AssetTransitionLog.
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
        # resubmit: il richiedente originale può reinserire
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
            delta_data={'asset_id': instance.asset_id, 'request_type': instance.request_type},
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
        """Restituisce None se la transizione è valida, Response di errore altrimenti."""
        allowed = ALLOWED_REQUEST_TRANSITIONS.get(asset_request.status, set())
        if target_status not in allowed:
            return Response(
                {
                    'error': _('Transizione non ammessa'),
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

        Transizione INSERITA → PIANIFICATA.
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Richiesta non trovata')}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_transition(asset_request, AssetRequestStatus.PIANIFICATA)
        if err:
            return err

        serializer = AssetRequestPlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        asset_request.status = AssetRequestStatus.PIANIFICATA
        if 'planned_date' in data:
            asset_request.planned_date = data['planned_date']
        if 'assigned_to' in data:
            from django.contrib.auth.models import User
            try:
                asset_request.assigned_to = User.objects.get(pk=data['assigned_to']) if data['assigned_to'] else None
            except User.DoesNotExist:
                return Response({'error': _('Utente non trovato')}, status=status.HTTP_400_BAD_REQUEST)
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

        Transizione → EVASA.
        Esegue effettivamente la transizione di stato e location sull'asset,
        crea un AssetTransitionLog e aggiorna la richiesta come evasa.
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Richiesta non trovata')}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_transition(asset_request, AssetRequestStatus.EVASA)
        if err:
            return err

        asset = asset_request.asset

        with transaction.atomic():
            # Crea il log di transizione (storico ufficiale)
            AssetTransitionLog.objects.create(
                asset=asset,
                from_state=asset.state,
                to_state=asset_request.to_state,
                from_room=asset.room,
                to_room=asset_request.to_room,
                user=request.user,
                notes=f'[Richiesta #{asset_request.pk}] {asset_request.notes}',
            )

            # Aggiorna l'asset
            asset.state = asset_request.to_state
            asset.room = asset_request.to_room
            asset.save(update_fields=['state', 'room', 'updated_at'])

            # Chiude la richiesta
            asset_request.status = AssetRequestStatus.EVASA
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

        Transizione → RIFIUTATA (terminale).
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Richiesta non trovata')}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_transition(asset_request, AssetRequestStatus.RIFIUTATA)
        if err:
            return err

        serializer = AssetRequestRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        asset_request.status = AssetRequestStatus.RIFIUTATA
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

        Transizione → IN_CHIARIMENTO.
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Richiesta non trovata')}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_transition(asset_request, AssetRequestStatus.IN_CHIARIMENTO)
        if err:
            return err

        serializer = AssetRequestClarifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        asset_request.status = AssetRequestStatus.IN_CHIARIMENTO
        asset_request.clarification_notes = serializer.validated_data['clarification_notes']
        asset_request.save()

        log_action(request, SecurityAuditLog.Action.ASSET_REQUEST_CLARIFY, 'asset_request',
                   resource_id=asset_request.pk)
        return Response(AssetRequestSerializer(asset_request).data)

    @action(detail=True, methods=['post'], url_path='resubmit')
    def resubmit(self, request, pk=None):
        """
        POST /asset/asset_request/{id}/resubmit
        Body: { "notes": "..." }  (opzionale)

        Transizione IN_CHIARIMENTO → INSERITA.
        Solo il richiedente originale può reinserire la propria richiesta.
        """
        asset_request = self._get_request_or_404(pk)
        if asset_request is None:
            return Response({'error': _('Richiesta non trovata')}, status=status.HTTP_404_NOT_FOUND)

        if asset_request.created_by != request.user and not request.user.is_staff:
            return Response(
                {'error': _('Solo il richiedente originale può reinserire la richiesta')},
                status=status.HTTP_403_FORBIDDEN,
            )

        err = self._check_transition(asset_request, AssetRequestStatus.INSERITA)
        if err:
            return err

        serializer = AssetRequestResubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        asset_request.status = AssetRequestStatus.INSERITA
        asset_request.clarification_notes = ''
        if serializer.validated_data.get('notes'):
            asset_request.notes = serializer.validated_data['notes']
        asset_request.save()

        log_action(request, SecurityAuditLog.Action.ASSET_REQUEST_RESUBMIT, 'asset_request',
                   resource_id=asset_request.pk)
        return Response(AssetRequestSerializer(asset_request).data)
