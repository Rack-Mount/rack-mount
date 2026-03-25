from rest_framework import viewsets, parsers
from location.models import Room
from location.serializers import RoomSerializer
from shared.mixins import StandardFilterMixin
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import MapEditPermission
from accounts.audit import AuditLogMixin
from accounts.models import SecurityAuditLog


class RoomViewSet(AuditLogMixin, StandardFilterMixin, viewsets.ModelViewSet):
    audit_resource_type = 'room'
    audit_action_create = SecurityAuditLog.Action.INFRA_CREATE
    audit_action_update = SecurityAuditLog.Action.INFRA_UPDATE
    audit_action_delete = SecurityAuditLog.Action.INFRA_DELETE
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
    permission_classes = [IsAuthenticated, MapEditPermission]
    queryset = Room.objects.select_related('location').all()
    serializer_class = RoomSerializer
    parser_classes = [parsers.JSONParser,
                      parsers.MultiPartParser, parsers.FormParser]
    filterset_fields = ['location', 'room_type']
    search_fields = ['name', 'description', 'manager']
