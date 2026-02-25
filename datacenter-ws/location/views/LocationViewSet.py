from rest_framework import viewsets
from rest_framework import permissions
from location.models import Location
from location.serializers import LocationSerializer


class LocationViewSet(viewsets.ModelViewSet):
    """
    LocationViewSet is a viewset for handling CRUD operations on Location model.

    Attributes:
        queryset (QuerySet): A queryset containing all Location objects.
        serializer_class (Serializer): The serializer class used for serializing and deserializing Location objects.
        permission_classes (list): A list of permission classes that determine access control. 
                                   In this case, it allows authenticated users to perform any request 
                                   and unauthenticated users to perform read-only requests.
    """
    queryset = Location.objects.all()
    serializer_class = LocationSerializer

    # permission_classes = [permissions.IsAuthenticatedOrReadOnly]
