from rest_framework import viewsets
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
        ordering (list): The default ordering for the queryset, ordered by 'name'.
        filterset_fields (list): The fields that can be used to filter the queryset, in this case, 'name'.
    """

    queryset = Rack.objects.all()
    serializer_class = RackSerializer
    pagination_class = StandardResultsSetPagination
    ordering = ['name']
    filterset_fields = ['name']
