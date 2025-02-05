from rest_framework import viewsets
from rest_framework import permissions
from dc.models import LocationCustomField
from dc.serializers import LocationCustomFieldSerializer


class LocationCustomFieldViewSet(viewsets.ModelViewSet):
    queryset = LocationCustomField.objects.all()
    serializer_class = LocationCustomFieldSerializer

    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
