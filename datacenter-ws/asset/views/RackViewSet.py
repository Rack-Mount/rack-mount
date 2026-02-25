from rest_framework import viewsets
from rest_framework import filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.serializers import RackSerializer
from asset.models import Rack
from asset.paginations import StandardResultsSetPagination


class RackViewSet(viewsets.ModelViewSet):
    """
    RackViewSet is a viewset for handling CRUD operations on Rack objects.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all Rack objects.
        serializer_class (Serializer): The serializer class used for Rack objects.
        pagination_class (Pagination): The pagination class used for paginating results.
        filter_backends (tuple): The filter backends used for ordering and filtering.
        ordering_fields (str): The fields that can be used for ordering.
        ordering (list): The default ordering for the queryset, ordered by 'name'.
        filterset_fields (list): The fields that can be used to filter the queryset.
        lookup_field (str): The field used for individual object lookups.
    """

    queryset = Rack.objects.select_related(
        'model', 'room', 'room__location'
    ).all()
    serializer_class = RackSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter,
                       filters.SearchFilter, DjangoFilterBackend)
    ordering_fields = '__all__'
    ordering = ['name']
    filterset_fields = ['name', 'room']
    lookup_field = 'name'
