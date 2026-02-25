from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.serializers import RackTypeSerializer
from asset.models import RackType
from asset.paginations import StandardResultsSetPagination


class RackTypeViewSet(viewsets.ModelViewSet):
    """
    RackTypeViewSet is a viewset for handling CRUD operations on RackType model.

    Attributes:
        queryset (QuerySet): A queryset containing all RackType objects.
        serializer_class (Serializer): The serializer class used for RackType objects.
        pagination_class (Pagination): The pagination class used for paginating results.
        filter_backends (tuple): The filter backends used for ordering, searching, and filtering.
        ordering (list): Default ordering for the queryset, ordered by 'model'.
        filterset_fields (list): Fields that can be used to filter the queryset.
        search_fields (list): The fields that can be searched.
    """

    queryset = RackType.objects.all()
    serializer_class = RackTypeSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter, filters.SearchFilter, DjangoFilterBackend)
    ordering = ['model']
    filterset_fields = ['model']
    search_fields = ['model']
