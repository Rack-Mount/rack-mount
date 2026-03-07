from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import UserManagementViewSet, RoleListView

router = DefaultRouter()
router.register(r'users', UserManagementViewSet, basename='users')

urlpatterns = router.urls + [
    path('roles/', RoleListView.as_view(), name='role-list'),
]
