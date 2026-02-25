from rest_framework import viewsets
from asset.serializers import AssetStateSerializer
from asset.models import AssetState
from asset.paginations import StandardResultsSetPagination
from rest_framework import permissions


class AssetStateViewSet(viewsets.ModelViewSet):
    """
    AssetStateViewSet is a viewset for handling CRUD operations on AssetState objects.

    Attributes:
        queryset (QuerySet): The queryset that retrieves all AssetState objects.
        serializer_class (Serializer): The serializer class used to serialize and deserialize AssetState objects.
        pagination_class (Pagination): The pagination class used to paginate the results.
        ordering (list): The default ordering for the queryset, ordered by 'name'.
        filterset_fields (list): The fields that can be used to filter the queryset.
    """
    queryset = AssetState.objects.all()
    serializer_class = AssetStateSerializer
    pagination_class = StandardResultsSetPagination
    ordering = ['name']
    filterset_fields = ['name']
    # permission_classes = [permissions.IsAuthenticatedOrReadOnly]
