from django.urls import path, include
"""
This module defines the URL patterns for the asset application.

It includes the following view sets:
- AssetViewSet: Handles CRUD operations for assets.
- AssetModelViewSet: Handles CRUD operations for asset models.
- VendorViewSet: Handles CRUD operations for vendors.
- AssetStateViewSet: Handles CRUD operations for asset states.
- AssetTypeViewSet: Handles CRUD operations for asset types.

The URL patterns are registered with a DefaultRouter from the Django REST framework,
which automatically generates the appropriate URLs for the view sets without trailing slashes.

URL patterns:
- /asset
- /asset_model
- /vendor
- /asset_state
- /asset_type
"""
from rest_framework.routers import DefaultRouter
from asset.views import AssetViewSet, AssetModelViewSet, VendorViewSet, AssetStateViewSet, AssetTypeViewSet

router = DefaultRouter(trailing_slash=False)
router.register('asset', AssetViewSet)
router.register('asset_model', AssetModelViewSet)
router.register('vendor', VendorViewSet)
router.register('asset_state', AssetStateViewSet)
router.register('asset_type', AssetTypeViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
