from rest_framework import viewsets
from rest_framework import permissions
from datacenter.models import LocationCustomField
from datacenter.serializers import LocationCustomFieldSerializer


class LocationCustomFieldViewSet(viewsets.ModelViewSet):
    queryset = LocationCustomField.objects.all()
    serializer_class = LocationCustomFieldSerializer

    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
