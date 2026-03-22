from django.contrib.auth.models import User
from rest_framework import generics, viewsets, mixins, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import IsAdminRole
from accounts.serializers import RoleSerializer, UserListSerializer, UserCreateSerializer, UserUpdateSerializer, ChangePasswordSerializer, UserPreferencesSerializer


class UserManagementViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    CRUD for User management. Accessible only by Admin role.
    """
    queryset = User.objects.select_related(
        'profile__role').order_by('username')
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        if self.action in ('update', 'partial_update'):
            return UserUpdateSerializer
        return UserListSerializer

    def perform_destroy(self, instance):
        if instance == self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You cannot delete your own account.")
        instance.delete()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        response_serializer = UserListSerializer(
            user, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class RoleListView(generics.ListAPIView):
    """Read-only list of all available roles. Accessible only by Admin role."""
    queryset = Role.objects.order_by('id')
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]
    pagination_class = None


class ChangePasswordView(generics.GenericAPIView):
    """Allow any authenticated user to change their own password."""
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data['current_password']):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'current_password': 'Incorrect password.'})
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'detail': 'Password changed successfully.'}, status=status.HTTP_200_OK)


class UserPreferencesView(generics.GenericAPIView):
    """GET/PATCH /auth/preferences/ — read or update the authenticated user's preferences."""
    serializer_class = UserPreferencesSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {
            'measurement_system': request.user.profile.measurement_system,
        }
        serializer = UserPreferencesSerializer(data=data)
        serializer.is_valid()
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserPreferencesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.update(request.user, serializer.validated_data)
        return Response(serializer.data)
