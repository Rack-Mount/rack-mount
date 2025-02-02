from rest_framework import viewsets
from .models import DataCenterLocation
from .serializers import DataCenterLocationSerializer


class DataCenterLocationViewSet(viewsets.ModelViewSet):
    queryset = DataCenterLocation.objects.all()
    serializer_class = DataCenterLocationSerializer
