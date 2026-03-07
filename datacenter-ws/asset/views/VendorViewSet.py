from django.db.models import ProtectedError
from rest_framework import viewsets, status
from rest_framework.response import Response
from asset.serializers import VendorSerializer
from asset.models import Vendor
from shared.mixins import NameSearchMixin


class VendorViewSet(NameSearchMixin, viewsets.ModelViewSet):
    """
    VendorViewSet handles CRUD operations on the Vendor model.
    """
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    ordering_fields = ['name']

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "vendor_in_use"},
                status=status.HTTP_409_CONFLICT,
            )
