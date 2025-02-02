from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DataCenterLocationViewSet

router = DefaultRouter()
router.register(r'location', DataCenterLocationViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
