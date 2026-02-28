from django.db.models import ProtectedError
from rest_framework import viewsets, filters, status
from rest_framework.response import Response
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

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "vendor_in_use"},
                status=status.HTTP_409_CONFLICT,
            )
