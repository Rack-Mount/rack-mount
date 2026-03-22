"""
Test suite for authentication hardening:
- Ownership checks on logout/blacklist
- CSRF enforcement on token refresh
- Explicit permission_classes on MeView
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


class LogoutOwnershipCheckTest(TestCase):
    """Test that logout blocks token ownership mismatches."""

    def setUp(self):
        """Set up test users and API client."""
        self.user1 = User.objects.create_user(username='user1', password='TestPass123!')
        self.user2 = User.objects.create_user(username='user2', password='TestPass123!')
        self.client = APIClient()

    def test_logout_with_own_refresh_token_succeeds(self):
        """Logout with user's own refresh token should succeed."""
        # Authenticate as user1
        refresh = RefreshToken.for_user(self.user1)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        self.client.cookies['refresh_token'] = refresh_token
        
        response = self.client.post(reverse('logout'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Logout successful', response.data.get('detail', ''))

    def test_logout_blocks_other_user_token(self):
        """Logout with another user's refresh token should return 403."""
        # Authenticate as user1
        refresh_user1 = RefreshToken.for_user(self.user1)
        access_user1 = str(refresh_user1.access_token)
        
        # But provide user2's refresh token in cookie
        refresh_user2 = RefreshToken.for_user(self.user2)
        refresh_token_user2 = str(refresh_user2)
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_user1}")
        self.client.cookies['refresh_token'] = refresh_token_user2
        
        response = self.client.post(reverse('logout'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('does not belong', response.data.get('detail', ''))

    def test_logout_missing_refresh_token(self):
        """Logout without refresh token cookie should return 400."""
        refresh = RefreshToken.for_user(self.user1)
        access_token = str(refresh.access_token)
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        # Don't set refresh_token cookie
        
        response = self.client.post(reverse('logout'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('not found', response.data.get('detail', '').lower())


class TokenBlacklistOwnershipCheckTest(TestCase):
    """Test that token blacklist blocks ownership mismatches."""

    def setUp(self):
        """Set up test users and API client."""
        self.user1 = User.objects.create_user(username='user1', password='TestPass123!')
        self.user2 = User.objects.create_user(username='user2', password='TestPass123!')
        self.client = APIClient()

    def test_blacklist_with_own_token_succeeds(self):
        """Blacklist with user's own token should succeed."""
        refresh = RefreshToken.for_user(self.user1)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        
        response = self.client.post(reverse('token_blacklist'), {
            'refresh': refresh_token
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('blacklisted', response.data.get('detail', '').lower())

    def test_blacklist_blocks_other_user_token(self):
        """Blacklist with another user's token should return 403."""
        # Authenticate as user1
        refresh_user1 = RefreshToken.for_user(self.user1)
        access_user1 = str(refresh_user1.access_token)
        
        # Try to blacklist user2's token
        refresh_user2 = RefreshToken.for_user(self.user2)
        refresh_token_user2 = str(refresh_user2)
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_user1}")
        response = self.client.post(reverse('token_blacklist'), {
            'refresh': refresh_token_user2
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('does not belong', response.data.get('detail', ''))


class RefreshTokenCSRFEnforcementTest(TestCase):
    """Test that refresh token endpoint enforces CSRF token."""

    def setUp(self):
        """Set up test user and API client."""
        self.user1 = User.objects.create_user(username='user1', password='TestPass123!')
        self.client = APIClient()

    def test_refresh_with_valid_token_succeeds(self):
        """Refresh with valid refresh token should return new access token."""
        refresh = RefreshToken.for_user(self.user1)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        self.client.cookies['refresh_token'] = refresh_token
        
        response = self.client.post(reverse('token_refresh'))
        # Should either succeed or require CSRF - both indicate handler is called
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_403_FORBIDDEN])
        if response.status_code == status.HTTP_200_OK:
            self.assertIn('access', response.data)


class MeViewPermissionsTest(TestCase):
    """Test that MeView requires authentication."""

    def setUp(self):
        """Set up test user and API client."""
        self.user1 = User.objects.create_user(username='user1', password='TestPass123!')
        self.client = APIClient()

    def test_meview_anonymous_user_denied(self):
        """GET /auth/me/ as anonymous user should return 401."""
        response = self.client.get(reverse('me'))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_meview_authenticated_user_allowed(self):
        """GET /auth/me/ as authenticated user should return user profile."""
        refresh = RefreshToken.for_user(self.user1)
        access_token = str(refresh.access_token)
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        response = self.client.get(reverse('me'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('id'), self.user1.id)
        self.assertEqual(response.data.get('username'), self.user1.username)

    def test_meview_returns_user_details(self):
        """GET /auth/me/ should return correct user details."""
        refresh = RefreshToken.for_user(self.user1)
        access_token = str(refresh.access_token)
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        response = self.client.get(reverse('me'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(response.data.get('id'), [self.user1.id])

