from django.urls import path, include
from rest_framework.routers import DefaultRouter
from datacenter.views import LocationViewSet, LocationCustomFieldViewSet

router = DefaultRouter(trailing_slash=False)

urlpatterns = [
    path('', include(router.urls)),
]
