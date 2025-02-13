from rest_framework import viewsets
from asset.serializers import RackUnitSerializer
from asset.models import RackUnit
from asset.paginations import StandardResultsSetPagination
from rest_framework import filters
import django_filters.rest_framework
from rest_framework import permissions


class RackUnitViewSet(viewsets.ModelViewSet):
    """
    RackUnitViewSet is a viewset for handling CRUD operations on RackUnit objects.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all RackUnit objects.
        serializer_class (Serializer): The serializer class used to serialize and deserialize RackUnit objects.
        pagination_class (Pagination): The pagination class used to paginate the results.
        filter_backends (tuple): The filter backends used for filtering and searching the queryset.
        filterset_fields (list): The fields that can be used to filter the queryset.
        search_fields (list): The fields that can be used to search the queryset.
    """

    queryset = RackUnit.objects.all()
    serializer_class = RackUnitSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter, filters.SearchFilter,
                       django_filters.rest_framework.DjangoFilterBackend)
    filterset_fields = ['rack__name', 'device__hostname', 'rack__location']
    search_fields = ['rack__name', 'device__hostname']
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
