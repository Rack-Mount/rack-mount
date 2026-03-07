from rest_framework import viewsets
from location.models import LocationCustomField
from location.serializers import LocationCustomFieldSerializer
from shared.mixins import StandardFilterMixin
from accounts.mixins import RoleBasedViewSetMixin


class LocationCustomFieldViewSet(RoleBasedViewSetMixin, StandardFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for viewing and editing LocationCustomField instances.
    """
    queryset = LocationCustomField.objects.select_related('location').all()
    serializer_class = LocationCustomFieldSerializer
    filterset_fields = ['location']
    search_fields = ['field_name', 'field_value']
    ordering = ['location__name', 'field_name']
