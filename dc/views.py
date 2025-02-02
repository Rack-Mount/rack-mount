from rest_framework import viewsets
from rest_framework import permissions
from .models import DataCenterLocation
from .serializers import DataCenterLocationSerializer


class DataCenterLocationViewSet(viewsets.ModelViewSet):
    queryset = DataCenterLocation.objects.all()
    serializer_class = DataCenterLocationSerializer

    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
