from rest_framework import viewsets, status
from rest_framework.response import Response
from django.utils.translation import gettext as _
from django.db.models import Count, Sum
from asset.serializers import RackSerializer
from asset.models import Rack, RackUnit
from shared.mixins import StandardFilterMixin
from accounts.mixins import RoleBasedViewSetMixin


class RackViewSet(RoleBasedViewSetMixin, StandardFilterMixin, viewsets.ModelViewSet):
    """
    RackViewSet is a viewset for handling CRUD operations on Rack objects.
    """

    queryset = Rack.objects.select_related(
        'model', 'room', 'room__location'
    ).annotate(
        used_units=Count('rackunit__position', distinct=True),
        total_power_watt=Sum('rackunit__device__power_cosumption_watt'),
    ).all()
    serializer_class = RackSerializer
    ordering_fields = ['name', 'room__location__name', 'room__name',
                       'model__model', 'used_units', 'total_power_watt']
    ordering = ['name']
    search_fields = ['name']
    filterset_fields = ['name', 'room', 'room__location']
    lookup_field = 'name'

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if RackUnit.objects.filter(rack=instance).exists():
            return Response(
                {'detail': _(
                    'Rack has associated units — remove them before deleting.')},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)
