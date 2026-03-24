from django.urls import path, include
from rest_framework.routers import DefaultRouter
from location.views import LocationViewSet, LocationCustomFieldViewSet, RoomViewSet, RackViewSet, RackTypeViewSet, WarehouseItemViewSet

router = DefaultRouter(trailing_slash=False)
router.register(r'location', LocationViewSet)
router.register(r'locationcustomfield', LocationCustomFieldViewSet)
router.register(r'room', RoomViewSet)
router.register(r'rack', RackViewSet, basename='rack')
router.register(r'rack_type', RackTypeViewSet)
router.register(r'warehouse_item', WarehouseItemViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
