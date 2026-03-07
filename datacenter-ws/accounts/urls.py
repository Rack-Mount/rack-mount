from rest_framework.routers import DefaultRouter
from .views import UserManagementViewSet

router = DefaultRouter()
router.register(r'users', UserManagementViewSet, basename='users')

urlpatterns = router.urls
