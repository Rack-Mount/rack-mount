from rest_framework import viewsets
from asset.serializers import VendorSerializer
from asset.models import Vendor
from rest_framework import filters
import django_filters.rest_framework
from asset.paginations import StandardResultsSetPagination


class VendorViewSet(viewsets.ModelViewSet):
    """
    VendorViewSet is a viewset for handling CRUD operations on Vendor model.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all Vendor objects.
        serializer_class (Serializer): The serializer class used to serialize and deserialize Vendor objects.
        pagination_class (Pagination): The pagination class used to paginate the results.
        ordering (list): The default ordering for the queryset, ordered by 'name'.
        filterset_fields (list): The fields that can be used to filter the queryset, in this case, 'name'.
    """
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    pagination_class = StandardResultsSetPagination
    ordering = ['name']
    filterset_fields = ['name']
