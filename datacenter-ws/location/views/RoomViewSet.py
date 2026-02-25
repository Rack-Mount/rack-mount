from rest_framework import viewsets, permissions, parsers
from location.models import Room
from location.serializers import RoomSerializer


class RoomViewSet(viewsets.ModelViewSet):
    """
    RoomViewSet is a viewset for handling CRUD operations on the Room model.

    Supports multipart/form-data uploads for the floor_plan field.

    Attributes:
        queryset (QuerySet): A queryset containing all Room objects, with location pre-fetched.
        serializer_class (Serializer): The serializer class used for Room objects.
        permission_classes (list): Allows authenticated users full access and unauthenticated read-only access.
        parser_classes (list): Supports JSON, multipart form data, and URL-encoded form data.
        filterset_fields (list): Enables filtering by location.
    """
    queryset = Room.objects.select_related('location').all()
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    parser_classes = [parsers.MultiPartParser,
                      parsers.FormParser, parsers.JSONParser]
    filterset_fields = ['location']
