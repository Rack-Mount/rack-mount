from rest_framework import viewsets
from asset.serializers import AssetTypeSerializer
from asset.models import AssetType
from asset.paginations import StandardResultsSetPagination
from rest_framework import permissions


class AssetTypeViewSet(viewsets.ModelViewSet):
    """
    AssetTypeViewSet is a viewset for handling CRUD operations on AssetType model.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all AssetType objects.
        serializer_class (Serializer): The serializer class used for serializing and deserializing AssetType objects.
        pagination_class (Pagination): The pagination class used for paginating the results.
        ordering (list): The default ordering for the queryset, ordered by 'name'.
        filterset_fields (list): The fields that can be used to filter the queryset.
    """
    queryset = AssetType.objects.all()
    serializer_class = AssetTypeSerializer
    pagination_class = StandardResultsSetPagination
    ordering = ['name']
    filterset_fields = ['name']
    # permission_classes = [permissions.IsAuthenticatedOrReadOnly]
