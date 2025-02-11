from rest_framework import viewsets
from asset.serializers import RackUnitSerializer
from asset.models import RackUnit
from asset.paginations import StandardResultsSetPagination
from rest_framework import filters
import django_filters.rest_framework


class RackUnitViewSet(viewsets.ModelViewSet):

    queryset = RackUnit.objects.all()
    serializer_class = RackUnitSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter, filters.SearchFilter,
                       django_filters.rest_framework.DjangoFilterBackend)
    filterset_fields = ['rack', 'device__hostname', 'rack__location']
    search_fields = ['rack__name', 'device__hostname']
