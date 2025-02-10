from django.urls import path, include
from rest_framework.routers import DefaultRouter
from asset.views import AssetViewSet, AssetModelViewSet, VendorViewSet, AssetStateViewSet

router = DefaultRouter(trailing_slash=False)
router.register('asset', AssetViewSet)
router.register('asset_model', AssetModelViewSet)
router.register('vendor', VendorViewSet)
router.register('asset_state', AssetStateViewSet)
urlpatterns = [
    path('', include(router.urls)),
]
