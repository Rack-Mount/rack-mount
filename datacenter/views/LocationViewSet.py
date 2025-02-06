from rest_framework import viewsets
from rest_framework import permissions
from datacenter.models import Location
from datacenter.serializers import LocationSerializer


class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer

    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
