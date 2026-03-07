from rest_framework import viewsets, parsers
from location.models import Room
from location.serializers import RoomSerializer
from shared.mixins import StandardFilterMixin
from accounts.mixins import RoleBasedViewSetMixin


class RoomViewSet(RoleBasedViewSetMixin, StandardFilterMixin, viewsets.ModelViewSet):
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
    parser_classes = [parsers.JSONParser,
                      parsers.MultiPartParser, parsers.FormParser]
    filterset_fields = ['location', 'room_type']
    search_fields = ['name', 'description', 'manager']
