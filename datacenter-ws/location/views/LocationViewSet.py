from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from location.models import Location
from location.serializers import LocationSerializer
from asset.paginations import StandardResultsSetPagination


class LocationViewSet(viewsets.ModelViewSet):
    """
    LocationViewSet is a viewset for handling CRUD operations on Location model.

    Attributes:
        queryset (QuerySet): A queryset containing all Location objects.
        serializer_class (Serializer): The serializer class used for serializing and deserializing Location objects.
        pagination_class (Pagination): The pagination class used to paginate the results.
        filter_backends (tuple): The filter backends used for ordering and filtering.
        ordering_fields (str): The fields that can be used for ordering.
        ordering (list): The default ordering.
        filterset_fields (list): The fields that can be used for filtering.
        search_fields (list): The fields that can be searched.
    """
    queryset = Location.objects.prefetch_related('rooms').all()
    serializer_class = LocationSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter,
                       filters.SearchFilter, DjangoFilterBackend)
    ordering_fields = '__all__'
    ordering = ['name']
    filterset_fields = ['name', 'short_name']
    search_fields = ['name', 'short_name', 'location']
