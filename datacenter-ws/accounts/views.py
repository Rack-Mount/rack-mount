from django.contrib.auth.models import User
from rest_framework import generics, viewsets, mixins, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

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


class LogoutView(APIView):
    """
    POST /auth/logout/

    Invalidate the current refresh token (add to blacklist).
    Subsequent refresh attempts will fail, forcing re-authentication.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response(
                    {'detail': 'Refresh token required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {'detail': 'Logout successful. Token blacklisted.'},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class CookieTokenObtainView(APIView):
    """
    POST /auth/token/

    Accept username + password credentials.
    Return access + refresh tokens via HttpOnly, Secure, SameSite=Strict cookies.
    Minimal JSON response for frontend confirmation.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from django.contrib.auth import authenticate
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response(
                {'detail': 'Username and password required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(username=username, password=password)
        if not user:
            return Response(
                {'detail': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Generate tokens
        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        # Prepare response with Set-Cookie headers
        response = Response(
            {
                'detail': 'Login successful.',
                'username': user.username,
            },
            status=status.HTTP_200_OK,
        )

        # Set HttpOnly cookies
        response.set_cookie(
            key='refresh_token',
            value=str(refresh),
            max_age=3 * 24 * 60 * 60,  # 3 days
            httponly=True,
            secure=request.is_secure(),  # True in production (HTTPS)
            samesite='Strict',
            path='/',
        )
        response.set_cookie(
            key='access_token',
            value=str(access),
            max_age=15 * 60,  # 15 minutes
            httponly=True,
            secure=request.is_secure(),
            samesite='Strict',
            path='/',
        )

        return response


class CookieTokenRefreshView(APIView):
    """
    POST /auth/token/refresh/

    Accept refresh token from HttpOnly cookie.
    Return new access token via HttpOnly cookie.
    Requires no request body (cookie handled automatically).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get('refresh_token')

        if not refresh_token:
            return Response(
                {'detail': 'Refresh token not found in cookies.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            refresh = RefreshToken(refresh_token)
            new_access = refresh.access_token
        except (InvalidToken, TokenError) as e:
            return Response(
                {'detail': 'Invalid or expired refresh token.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        response = Response(
            {'detail': 'Token refreshed.'},
            status=status.HTTP_200_OK,
        )

        # Set new access token cookie
        response.set_cookie(
            key='access_token',
            value=str(new_access),
            max_age=15 * 60,  # 15 minutes
            httponly=True,
            secure=request.is_secure(),
            samesite='Strict',
            path='/',
        )

        return response


class CookieTokenBlacklistView(APIView):
    """
    POST /auth/token/blacklist/

    Invalidate refresh token from cookie and add to blacklist.
    Clear cookies on frontend.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.COOKIES.get('refresh_token')

        if not refresh_token:
            # Cookie may already be cleared on frontend; consider success
            response = Response(
                {'detail': 'Logout successful.'},
                status=status.HTTP_200_OK,
            )
        else:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
                response = Response(
                    {'detail': 'Logout successful. Token blacklisted.'},
                    status=status.HTTP_200_OK,
                )
            except Exception as e:
                return Response(
                    {'detail': str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Clear cookies on client side via response (browser will delete them)
        response.delete_cookie('access_token', path='/')
        response.delete_cookie('refresh_token', path='/')

        return response
