import logging

from django.contrib.auth.models import User
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.core.cache import cache
from accounts.audit import log_action
from django.utils.translation import gettext_lazy as _
from rest_framework import generics, viewsets, mixins, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from accounts.models import Role
from accounts.permissions import IsAdminRole
from accounts.throttling import LoginAnonThrottle, TokenRefreshThrottle
from accounts.serializers import (
    RoleSerializer,
    UserListSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    ChangePasswordSerializer,
    UserPreferencesSerializer,
    LogoutRequestSerializer,
    AuthDetailSerializer,
    CookieTokenObtainRequestSerializer,
    TokenObtainResponseSerializer,
    TokenRefreshRequestSerializer,
    TokenRefreshResponseSerializer,
)


logger = logging.getLogger(__name__)


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
            raise PermissionDenied(_("You cannot delete your own account."))
        instance.delete()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        response_serializer = UserListSerializer(
            user, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class RoleListView(generics.ListAPIView):
    """Read-only list of all available roles. Accessible only by Admin role. Cached for 5 minutes."""
    queryset = Role.objects.order_by('id')
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]
    pagination_class = None

    @method_decorator(cache_page(60 * 5))  # Cache for 5 minutes
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


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
            raise ValidationError(
                {'current_password': _('Incorrect password.')})
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'detail': _('Password changed successfully.')}, status=status.HTTP_200_OK)


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
        cache.delete(f"auth:me:user:{request.user.id}")
        return Response(serializer.data)


class LogoutView(APIView):
    """
    POST /auth/logout/

    Invalidate the current refresh token (add to blacklist).
    Subsequent refresh attempts will fail, forcing re-authentication.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['auth'],
        request=LogoutRequestSerializer,
        responses={
            200: AuthDetailSerializer,
            400: AuthDetailSerializer,
        },
    )
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'detail': _('Refresh token required.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token_user_id = token.get('user_id')
            if token_user_id is None or str(token_user_id) != str(request.user.id):
                logger.warning(
                    'Logout blocked due to refresh-token/user mismatch',
                    extra={'request_user_id': request.user.id,
                           'token_user_id': token_user_id},
                )
                return Response(
                    {'detail': _(
                        'Refresh token does not belong to the authenticated user.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
            token.blacklist()
            return Response(
                {'detail': _('Logout successful. Token blacklisted.')},
                status=status.HTTP_200_OK,
            )
        except Exception:
            logger.exception('Logout failed while blacklisting refresh token')
            return Response(
                {'detail': _(
                    'Unable to logout with the provided refresh token.')},
                status=status.HTTP_400_BAD_REQUEST,
            )


class CookieTokenObtainView(APIView):
    """
    POST /auth/token/

    Accept username + password credentials.
    Return access and refresh tokens in the response body.
    """
    permission_classes = [AllowAny]
    throttle_classes = [LoginAnonThrottle]

    @extend_schema(
        tags=['auth'],
        request=CookieTokenObtainRequestSerializer,
        responses={
            200: TokenObtainResponseSerializer,
            400: AuthDetailSerializer,
            401: AuthDetailSerializer,
        },
    )
    def post(self, request):
        from django.contrib.auth import authenticate
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response(
                {'detail': _('Username and password required.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(username=username, password=password)
        if not user:
            from accounts.models import SecurityAuditLog
            log_action(request, SecurityAuditLog.Action.LOGIN_FAILED, 'auth',
                       resource_id=username or '')
            return Response(
                {'detail': _('Invalid credentials.')},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Generate tokens
        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        # Embed role claims in both tokens so the backend can read them
        # without a DB lookup, and so the refresh view can return them.
        try:
            role_data = RoleSerializer(user.profile.role).data
        except Exception:
            role_data = None
        # copied into access token by simple_jwt
        refresh['role'] = role_data
        access['role'] = role_data
        refresh['username'] = user.username
        access['username'] = user.username

        from accounts.models import SecurityAuditLog
        log_action(request, SecurityAuditLog.Action.LOGIN_SUCCESS, 'auth',
                   resource_id=user.username)

        return Response(
            {
                'detail': _('Login successful.'),
                'username': user.username,
                'access': str(access),
                'refresh': str(refresh),
                'role': role_data,
            },
            status=status.HTTP_200_OK,
        )


class CookieTokenRefreshView(APIView):
    """
    POST /auth/token/refresh/

    Accept refresh token in request body.
    Return new access token in response body.
    """
    permission_classes = [AllowAny]
    throttle_classes = [TokenRefreshThrottle]

    @extend_schema(
        tags=['auth'],
        request=TokenRefreshRequestSerializer,
        responses={
            200: TokenRefreshResponseSerializer,
            401: AuthDetailSerializer,
        },
    )
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'detail': _('Refresh token required.')},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            refresh = RefreshToken(refresh_token)
            new_access = refresh.access_token
        except (InvalidToken, TokenError):
            return Response(
                {'detail': _('Invalid or expired refresh token.')},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Claims embedded at login time are carried in the refresh token.
        role_data = refresh.get('role', None)
        username = refresh.get('username', None)

        # Honour ROTATE_REFRESH_TOKENS: blacklist old token and issue a new one.
        from rest_framework_simplejwt.settings import api_settings as jwt_settings
        new_refresh_str = None
        if jwt_settings.ROTATE_REFRESH_TOKENS:
            if jwt_settings.BLACKLIST_AFTER_ROTATION:
                try:
                    refresh.blacklist()
                except Exception:
                    pass
            refresh.set_jti()
            refresh.set_exp()
            refresh.set_iat()
            new_refresh_str = str(refresh)

        return Response(
            {
                'detail': _('Token refreshed.'),
                'access': str(new_access),
                'refresh': new_refresh_str,
                'username': username,
                'role': role_data,
            },
            status=status.HTTP_200_OK,
        )


class CookieTokenBlacklistView(APIView):
    """
    POST /auth/token/blacklist/

    Accept refresh token in request body and add it to the blacklist.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['auth'],
        request=LogoutRequestSerializer,
        responses={
            200: AuthDetailSerializer,
            400: AuthDetailSerializer,
        },
    )
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'detail': _('Logout successful.')},
                status=status.HTTP_200_OK,
            )
        try:
            token = RefreshToken(refresh_token)
            token_user_id = token.get('user_id')
            if token_user_id is None or str(token_user_id) != str(request.user.id):
                logger.warning(
                    'Cookie token blacklist blocked due to refresh-token/user mismatch',
                    extra={'request_user_id': request.user.id,
                           'token_user_id': token_user_id},
                )
                return Response(
                    {'detail': _(
                        'Refresh token does not belong to the authenticated user.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
            token.blacklist()
            return Response(
                {'detail': _('Logout successful. Token blacklisted.')},
                status=status.HTTP_200_OK,
            )
        except Exception:
            logger.exception('Cookie token blacklist failed')
            return Response(
                {'detail': _('Unable to blacklist refresh token.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
