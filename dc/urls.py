from django.urls import path, include
from rest_framework.routers import DefaultRouter
from dc.views import LocationViewSet, LocationCustomFieldViewSet

router = DefaultRouter(trailing_slash=False)
router.register(r'location', LocationViewSet)
router.register(r'locationcustomfiled', LocationCustomFieldViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
