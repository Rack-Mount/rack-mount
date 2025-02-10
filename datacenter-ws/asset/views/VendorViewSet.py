from rest_framework import viewsets
from asset.serializers import VendorSerializer
from asset.models import Vendor
from rest_framework import filters
import django_filters.rest_framework
from asset.paginations import StandardResultsSetPagination


class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    pagination_class = StandardResultsSetPagination
    ordering = ['name']
    filterset_fields = ['name']
