from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.models import GenericComponent
from asset.serializers import GenericComponentSerializer
from asset.paginations import StandardResultsSetPagination


class GenericComponentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing GenericComponent objects (cable managers, blanking panels,
    patch panels, PDUs, shelves, and other consumable rack accessories).

    Supports standard CRUD operations, filtering, ordering and searching.
    """

    queryset = GenericComponent.objects.all()
    serializer_class = GenericComponentSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter, filters.SearchFilter, DjangoFilterBackend)
    filterset_fields = ['component_type']
    search_fields = ['name', 'note']
    ordering_fields = ['name', 'component_type', 'rack_units', 'created_at']
