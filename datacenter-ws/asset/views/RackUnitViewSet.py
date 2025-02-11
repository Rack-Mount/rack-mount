from rest_framework import viewsets
from asset.serializers import RackUnitSerializer
from asset.models import RackUnit
from asset.paginations import StandardResultsSetPagination


class RackUnitViewSet(viewsets.ModelViewSet):

    queryset = RackUnit.objects.all()
    serializer_class = RackUnitSerializer
    pagination_class = StandardResultsSetPagination
    filterset_fields = ['rack']
