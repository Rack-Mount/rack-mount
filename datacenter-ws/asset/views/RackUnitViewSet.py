from decimal import Decimal

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import RackResourcePermission
from asset.models import RackUnit
from asset.serializers import RackUnitSerializer
from shared.mixins import StandardFilterMixin


class RackUnitViewSet(StandardFilterMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, RackResourcePermission]

    queryset = RackUnit.objects.select_related(
        'rack',
        'rack__model',
        'rack__room',
        'rack__room__location',
        'device',
        'device__model',
        'device__model__vendor',
        'device__model__type',
        'device__state',
        'generic_component',
        'generic_component__warehouse_item',
    ).all()
    serializer_class = RackUnitSerializer
    filterset_fields = ['rack__name', 'device__hostname', 'rack__room']
    search_fields = ['rack__name', 'device__hostname']

    def _decrement_warehouse_stock(self, generic_component):
        """Decrementa di 1 lo stock dell'articolo di magazzino collegato al componente.
        Solleva ValidationError se le scorte sono esaurite."""
        wi = getattr(generic_component, 'warehouse_item', None)
        if wi is None:
            return
        from location.models import WarehouseItem
        with transaction.atomic():
            wi_locked = WarehouseItem.objects.select_for_update().get(pk=wi.pk)
            if wi_locked.quantity <= Decimal('0'):
                raise ValidationError(
                    {'generic_component': 'Scorte esaurite per questo articolo di magazzino.'}
                )
            wi_locked.quantity -= Decimal('1')
            wi_locked.save(update_fields=['quantity'])

    def perform_create(self, serializer):
        gc = serializer.validated_data.get('generic_component')
        if gc:
            self._decrement_warehouse_stock(gc)
        serializer.save()

    @action(detail=True, methods=['post'], url_path='return-to-stock')
    def return_to_stock(self, request, pk=None):
        """
        Ritorna il componente installato al magazzino:
        incrementa la quantità dell'articolo collegato e rimuove il componente dal rack.
        """
        rack_unit = self.get_object()
        gc = rack_unit.generic_component
        if gc is None:
            return Response(
                {'detail': 'Nessun componente installato in questa posizione.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        wi = getattr(gc, 'warehouse_item', None)
        if wi is None:
            return Response(
                {'detail': 'Il componente non ha un articolo di magazzino collegato.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from location.models import WarehouseItem
        with transaction.atomic():
            wi_locked = WarehouseItem.objects.select_for_update().get(pk=wi.pk)
            wi_locked.quantity += Decimal('1')
            wi_locked.save(update_fields=['quantity'])
            rack_unit.generic_component = None
            rack_unit.save(update_fields=['generic_component'])

        return Response({'detail': 'Componente rimosso e ritornato al magazzino.'}, status=status.HTTP_200_OK)
