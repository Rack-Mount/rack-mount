from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from location.models import LocationCustomField
from location.serializers import LocationCustomFieldSerializer
from asset.paginations import StandardResultsSetPagination


class LocationCustomFieldViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and editing LocationCustomField instances.
    """
    queryset = LocationCustomField.objects.select_related('location').all()
    serializer_class = LocationCustomFieldSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter,
                       filters.SearchFilter, DjangoFilterBackend)
    filterset_fields = ['location']
    search_fields = ['field_name', 'field_value']
    ordering = ['location__name', 'field_name']
