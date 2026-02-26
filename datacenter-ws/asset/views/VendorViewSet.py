from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from asset.serializers import VendorSerializer
from asset.models import Vendor
from asset.paginations import StandardResultsSetPagination


class VendorViewSet(viewsets.ModelViewSet):
    """
    VendorViewSet handles CRUD operations on the Vendor model.
    """
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = (filters.OrderingFilter,
                       filters.SearchFilter, DjangoFilterBackend)
    ordering = ['name']
    ordering_fields = ['name']
    filterset_fields = ['name']
    search_fields = ['name']
