"""
accounts/views/auth_views.py
-----------------------------
Cookie-based JWT authentication views:

  • CookieTokenObtainView    — POST /auth/token/
  • CookieTokenRefreshView   — POST /auth/token/refresh/
  • CookieTokenBlacklistView — POST /auth/token/blacklist/
  • LogoutView               — POST /auth/logout/

Design notes
~~~~~~~~~~~~
* ``authentication_classes = []`` on the obtain/refresh views prevents an
  expired *Bearer* header already in the browser from triggering a 401
  before the cookie / credentials are even inspected.
* Refresh-token rotation and blacklisting honour the project's
  ``SIMPLE_JWT`` settings (``ROTATE_REFRESH_TOKENS``,
  ``BLACKLIST_AFTER_ROTATION``).
* The HTTP-only ``refresh_token`` cookie is always cleared on blacklist /
  logout, even when the actual blacklisting call fails, so the browser is
  left in a logged-out state regardless of server errors.
"""

import logging

from django.conf import settings as django_settings
from django.contrib.auth import authenticate
from django.utils.translation import gettext_lazy as _

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.audit import log_action
from accounts.models import SecurityAuditLog
from accounts.serializers import (
    AuthDetailSerializer,
    CookieTokenObtainRequestSerializer,
    LogoutRequestSerializer,
    RoleSerializer,
    TokenObtainResponseSerializer,
    TokenRefreshRequestSerializer,
    TokenRefreshResponseSerializer,
)
from accounts.throttling import LoginAnonThrottle, TokenRefreshThrottle

logger = logging.getLogger(__name__)


# ── Cookie helper ─────────────────────────────────────────────────────────────

def _set_refresh_cookie(response: Response, token_str: str) -> None:
    """Attach the HTTP-only ``refresh_token`` cookie to *response*."""
    response.set_cookie(
        key='refresh_token',
        value=token_str,
        httponly=True,
        secure=not django_settings.DEBUG,
        samesite='Lax',
        max_age=int(
            django_settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()
        ),
        path='/',
    )


# ── Auth views ────────────────────────────────────────────────────────────────

class CookieTokenObtainView(APIView):
    """
    POST /auth/token/

    Accept ``username`` + ``password`` credentials.  On success:

    - return ``access`` token and user ``role`` in the response body;
    - set an HTTP-only ``refresh_token`` cookie (never returned in body).

    ``authentication_classes = []`` prevents an expired *Bearer* header from
    triggering a premature 401 before credentials are even checked.
    """

    authentication_classes = []  # bypass JWT auth on expired Bearer headers
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
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response(
                {'detail': _('Username and password required.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(username=username, password=password)
        if not user:
            log_action(request, SecurityAuditLog.Action.LOGIN_FAILED, 'auth',
                       resource_id=username)
            return Response(
                {'detail': _('Invalid credentials.')},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Generate a token pair and embed role/username claims so downstream
        # views can return them without an extra DB query.
        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        try:
            role_data = RoleSerializer(user.profile.role).data
        except Exception:
            role_data = None

        refresh['role'] = role_data
        access['role'] = role_data
        refresh['username'] = user.username
        access['username'] = user.username

        log_action(request, SecurityAuditLog.Action.LOGIN_SUCCESS, 'auth',
                   resource_id=user.username)

        response = Response(
            {
                'detail': _('Login successful.'),
                'username': user.username,
                'access': str(access),
                'role': role_data,
            },
            status=status.HTTP_200_OK,
        )
        _set_refresh_cookie(response, str(refresh))
        return response


class CookieTokenRefreshView(APIView):
    """
    POST /auth/token/refresh/

    Read the refresh token from the HTTP-only cookie (falls back to the
    request body for transition compatibility).  Return a new ``access``
    token plus the embedded ``role`` and ``username`` claims.

    ``authentication_classes = []`` prevents an expired *Bearer* header from
    triggering a 401 before the cookie is read.
    Respects ``ROTATE_REFRESH_TOKENS`` / ``BLACKLIST_AFTER_ROTATION``.
    """

    authentication_classes = []  # bypass JWT auth on expired Bearer headers
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
        # Prefer the HTTP-only cookie; fall back to request body for compatibility.
        refresh_token = (
            request.COOKIES.get('refresh_token')
            or request.data.get('refresh')
        )
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

        # Role and username were embedded in the refresh token at login time.
        role_data = refresh.get('role', None)
        username = refresh.get('username', None)

        # Honour token rotation settings.
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

        response = Response(
            {
                'detail': _('Token refreshed.'),
                'access': str(new_access),
                'username': username,
                'role': role_data,
            },
            status=status.HTTP_200_OK,
        )
        if new_refresh_str:
            _set_refresh_cookie(response, new_refresh_str)
        return response


class CookieTokenBlacklistView(APIView):
    """
    POST /auth/token/blacklist/

    Read the refresh token from the cookie (or body), validate ownership,
    and add it to the JWT blacklist.

    The cookie is always cleared, even if blacklisting fails, so the browser
    is left in a logged-out state regardless of server errors.
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
        refresh_token = (
            request.COOKIES.get('refresh_token')
            or request.data.get('refresh')
        )
        response = Response(
            {'detail': _('Logout successful.')},
            status=status.HTTP_200_OK,
        )
        # Always clear the cookie — even if blacklisting fails the browser
        # must not hold a dangling refresh token.
        response.delete_cookie('refresh_token', path='/')

        if not refresh_token:
            return response

        try:
            token = RefreshToken(refresh_token)
            token_user_id = token.get('user_id')
            if token_user_id is None or str(token_user_id) != str(request.user.id):
                logger.warning(
                    'Cookie token blacklist blocked: refresh-token/user mismatch',
                    extra={
                        'request_user_id': request.user.id,
                        'token_user_id': token_user_id,
                    },
                )
                return Response(
                    {'detail': _(
                        'Refresh token does not belong to the authenticated user.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
            token.blacklist()
            response.data = {'detail': _('Logout successful. Token blacklisted.')}
            return response
        except Exception:
            logger.exception('Cookie token blacklist failed')
            return Response(
                {'detail': _('Unable to blacklist refresh token.')},
                status=status.HTTP_400_BAD_REQUEST,
            )


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
        refresh_token = (
            request.COOKIES.get('refresh_token')
            or request.data.get('refresh')
        )
        response = Response(
            {'detail': _('Logout successful. Token blacklisted.')},
            status=status.HTTP_200_OK,
        )
        response.delete_cookie('refresh_token', path='/')

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
                    'Logout blocked: refresh-token/user mismatch',
                    extra={
                        'request_user_id': request.user.id,
                        'token_user_id': token_user_id,
                    },
                )
                return Response(
                    {'detail': _(
                        'Refresh token does not belong to the authenticated user.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
            token.blacklist()
            return response
        except Exception:
            logger.exception('Logout failed while blacklisting refresh token')
            return Response(
                {'detail': _('Unable to logout with the provided refresh token.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
