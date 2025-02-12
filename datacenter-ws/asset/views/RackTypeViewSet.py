from rest_framework import viewsets
from asset.serializers import RackTypeSerializer
from asset.models import RackType
from asset.paginations import StandardResultsSetPagination
from rest_framework import permissions


class RackTypeViewSet(viewsets.ModelViewSet):
    """
    RackTypeViewSet is a viewset for handling CRUD operations on RackType model.

    Attributes:
        queryset (QuerySet): A queryset containing all RackType objects.
        serializer_class (Serializer): The serializer class used for RackType objects.
        pagination_class (Pagination): The pagination class used for paginating results.
        ordering (list): Default ordering for the queryset, ordered by 'model'.
        filterset_fields (list): Fields that can be used to filter the queryset, filtered by 'model'.
    """

    queryset = RackType.objects.all()
    serializer_class = RackTypeSerializer
    pagination_class = StandardResultsSetPagination
    ordering = ['model']
    filterset_fields = ['model']
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
