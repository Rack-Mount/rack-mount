from django.urls import path, include
from rest_framework.routers import DefaultRouter
from asset.views import AssetViewSet

router = DefaultRouter(trailing_slash=False)
router.register('asset', AssetViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
