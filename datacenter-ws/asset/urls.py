from django.urls import path, include
from rest_framework.routers import DefaultRouter
from asset.views import AssetViewSet, AssetModelViewSet, VendorViewSet

router = DefaultRouter(trailing_slash=False)
router.register('asset', AssetViewSet)
router.register('asset_model', AssetModelViewSet)
router.register('vendor', VendorViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
