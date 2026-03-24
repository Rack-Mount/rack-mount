from rest_framework import viewsets
from location.serializers import RackTypeSerializer
from location.models import RackType
from shared.mixins import NameSearchMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import RackResourcePermission


class RackTypeViewSet(NameSearchMixin, viewsets.ModelViewSet):
    """ViewSet for CRUD operations on RackType objects."""
    permission_classes = [IsAuthenticated, RackResourcePermission]

    queryset = RackType.objects.all()
    serializer_class = RackTypeSerializer
    ordering = ['model']
    filterset_fields = ['model']
    search_fields = ['model']
