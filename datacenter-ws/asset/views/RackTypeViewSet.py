from rest_framework import viewsets
from asset.serializers import RackTypeSerializer
from asset.models import RackType
from shared.mixins import NameSearchMixin
from accounts.mixins import RoleBasedViewSetMixin


class RackTypeViewSet(RoleBasedViewSetMixin, NameSearchMixin, viewsets.ModelViewSet):
    """ViewSet for CRUD operations on RackType objects."""

    queryset = RackType.objects.all()
    serializer_class = RackTypeSerializer
    # RackType uses 'model' as its name field
    ordering = ['model']
    filterset_fields = ['model']
    search_fields = ['model']
