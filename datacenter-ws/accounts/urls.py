from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import UserManagementViewSet, RoleListView, ChangePasswordView, UserPreferencesView, LogoutView

router = DefaultRouter()
router.register(r'users', UserManagementViewSet, basename='users')

urlpatterns = router.urls + [
    path('roles/', RoleListView.as_view(), name='role-list'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('preferences/', UserPreferencesView.as_view(), name='user-preferences'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
]
