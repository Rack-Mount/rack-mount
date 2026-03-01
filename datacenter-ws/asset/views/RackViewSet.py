from rest_framework import viewsets, status
from rest_framework import filters
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count, Sum
from asset.serializers import RackSerializer
from asset.models import Rack, RackUnit
from asset.paginations import StandardResultsSetPagination


class RackViewSet(viewsets.ModelViewSet):
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
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter,
                       filters.SearchFilter, DjangoFilterBackend)
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
                {'detail': 'Rack has associated units — remove them before deleting.'},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)
