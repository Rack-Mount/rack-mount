from rest_framework import viewsets
from rest_framework import permissions
from datacenter.models import LocationCustomField
from datacenter.serializers import LocationCustomFieldSerializer


class LocationCustomFieldViewSet(viewsets.ModelViewSet):
    """
    A viewset for viewing and editing LocationCustomField instances.

    This viewset provides `list`, `create`, `retrieve`, `update`, and `destroy` actions for the LocationCustomField model.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all LocationCustomField instances.
        serializer_class (Serializer): The serializer class used to validate and serialize LocationCustomField instances.
        permission_classes (list): The list of permission classes that determine access control. By default, it allows authenticated users to perform any action and unauthenticated users to read-only access.
    """
    queryset = LocationCustomField.objects.all()
    serializer_class = LocationCustomFieldSerializer

    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
