from rest_framework import viewsets, filters, parsers
from django_filters.rest_framework import DjangoFilterBackend
from location.models import Room
from location.serializers import RoomSerializer
from asset.paginations import StandardResultsSetPagination


class RoomViewSet(viewsets.ModelViewSet):
    """
    RoomViewSet is a viewset for handling CRUD operations on the Room model.

    Supports multipart/form-data uploads for the floor_plan field.

    Attributes:
        queryset (QuerySet): A queryset containing all Room objects, with location pre-fetched.
        serializer_class (Serializer): The serializer class used for Room objects.
        pagination_class (Pagination): The pagination class used to paginate the results.
        parser_classes (list): Supports JSON, multipart form data, and URL-encoded form data.
        filter_backends (tuple): The filter backends used for ordering and filtering.
        filterset_fields (list): Enables filtering by location.
        search_fields (list): The fields that can be searched.
    """
    queryset = Room.objects.select_related('location').all()
    serializer_class = RoomSerializer
    pagination_class = StandardResultsSetPagination
    parser_classes = [parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser]
    filter_backends = (filters.OrderingFilter, filters.SearchFilter, DjangoFilterBackend)
    filterset_fields = ['location']
    search_fields = ['name', 'description', 'manager']
