from django.urls import path, include
from rest_framework.routers import DefaultRouter
from datacenter.views import LocationViewSet, LocationCustomFieldViewSet, RoomViewSet

router = DefaultRouter(trailing_slash=False)
router.register(r'location', LocationViewSet)
router.register(r'locationcustomfiled', LocationCustomFieldViewSet)
router.register(r'room', RoomViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
