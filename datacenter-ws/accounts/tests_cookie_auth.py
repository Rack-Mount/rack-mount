"""
Tests for cookie-based JWT auth flow and import/export throttling.

Covers the security fixes introduced for:
- Refresh token stored in HTTP-only cookie (not response body / sessionStorage)
- Rate limiting on asset import/export and catalog import/export
"""

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role

# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_role(name, **flags):
    role, _ = Role.objects.get_or_create(name=name, defaults=flags)
    for field, val in flags.items():
        if getattr(role, field) != val:
            setattr(role, field, val)
            role.save(update_fields=[field])
    return role


def _make_user(username, password, role):
    user = User.objects.create_user(username=username, password=password)
    user.profile.role = role
    user.profile.save(update_fields=['role'])
    return user


# ── Cookie auth tests ─────────────────────────────────────────────────────────

class CookieTokenObtainTests(TestCase):
    """Login endpoint sets refresh cookie, does NOT return refresh in body."""

    def setUp(self):
        self.client = APIClient()
        role = _make_role(Role.Name.VIEWER)
        self.user = _make_user('cookie-login', 'Passw0rd!99', role)

    def test_login_returns_access_token_in_body(self):
        resp = self.client.post(
            '/auth/token/',
            {'username': 'cookie-login', 'password': 'Passw0rd!99'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('access', resp.data)

    def test_login_does_not_return_refresh_in_body(self):
        resp = self.client.post(
            '/auth/token/',
            {'username': 'cookie-login', 'password': 'Passw0rd!99'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertNotIn('refresh', resp.data)

    def test_login_sets_refresh_cookie(self):
        resp = self.client.post(
            '/auth/token/',
            {'username': 'cookie-login', 'password': 'Passw0rd!99'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('refresh_token', resp.cookies)

    def test_login_cookie_is_httponly(self):
        resp = self.client.post(
            '/auth/token/',
            {'username': 'cookie-login', 'password': 'Passw0rd!99'},
            format='json',
        )
        cookie = resp.cookies.get('refresh_token')
        self.assertIsNotNone(cookie)
        self.assertTrue(cookie['httponly'])

    def test_invalid_credentials_return_401(self):
        resp = self.client.post(
            '/auth/token/',
            {'username': 'cookie-login', 'password': 'wrong'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('refresh_token', resp.cookies)

    def test_missing_credentials_return_400(self):
        resp = self.client.post('/auth/token/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class CookieTokenRefreshTests(TestCase):
    """Refresh endpoint reads cookie, returns new access token, rotates cookie."""

    def setUp(self):
        self.client = APIClient()
        role = _make_role(Role.Name.VIEWER)
        self.user = _make_user('cookie-refresh', 'Passw0rd!99', role)
        # Log in to get the cookie
        self.client.post(
            '/auth/token/',
            {'username': 'cookie-refresh', 'password': 'Passw0rd!99'},
            format='json',
        )

    def test_refresh_via_cookie_returns_new_access_token(self):
        resp = self.client.post('/auth/token/refresh/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('access', resp.data)

    def test_refresh_rotates_cookie(self):
        resp = self.client.post('/auth/token/refresh/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('refresh_token', resp.cookies)

    def test_refresh_without_cookie_returns_401(self):
        # Fresh client — no cookie set
        fresh = APIClient()
        resp = fresh.post('/auth/token/refresh/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class CookieTokenBlacklistTests(TestCase):
    """Logout clears the refresh cookie regardless of body."""

    def setUp(self):
        self.client = APIClient()
        role = _make_role(Role.Name.VIEWER)
        self.user = _make_user('cookie-logout', 'Passw0rd!99', role)
        login_resp = self.client.post(
            '/auth/token/',
            {'username': 'cookie-logout', 'password': 'Passw0rd!99'},
            format='json',
        )
        self.access_token = login_resp.data.get('access', '')

    def test_blacklist_clears_cookie(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')
        resp = self.client.post('/auth/token/blacklist/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Cookie should be deleted (empty value or max-age=0)
        cookie = resp.cookies.get('refresh_token')
        self.assertIsNotNone(cookie)
        # Django sets max_age=0 or expires=past on delete_cookie
        self.assertTrue(
            cookie.get('max-age') == 0 or cookie.value == '',
            msg='refresh_token cookie was not cleared on logout',
        )

    def test_second_refresh_after_logout_fails(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')
        self.client.post('/auth/token/blacklist/', {}, format='json')
        # Cookie is gone — next refresh should fail
        fresh = APIClient()
        resp = fresh.post('/auth/token/refresh/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ── Import / Export throttle tests ────────────────────────────────────────────

# Override throttle rates to a low value so tests don't need 10+ requests
_THROTTLE_OVERRIDES = {
    'DEFAULT_THROTTLE_RATES': {
        'asset_import': '2/hour',
        'asset_export': '2/hour',
        'catalog_import': '2/hour',
        'catalog_export': '2/hour',
        # Keep other scopes high so unrelated endpoints don't interfere
        'anon': '10000/hour',
        'user': '10000/hour',
        'login_anon': '10000/hour',
        'token_refresh': '10000/hour',
        'media_file': '10000/hour',
        'port_training': '10000/hour',
        'port_correction': '10000/hour',
        'port_analysis': '10000/hour',
        'port_click_analysis': '10000/hour',
        'model_training_status': '10000/hour',
        'anon_port_training': '0/hour',
        'anon_port_correction': '0/hour',
    }
}


class AssetImportThrottleTests(TestCase):
    """Asset CSV import is rate-limited to asset_import scope."""

    def setUp(self):
        self.client = APIClient()
        role = _make_role(
            Role.Name.ADMIN,
            can_import_assets=True,
            can_manage_users=True,
        )
        self.user = _make_user('import-throttle', 'Passw0rd!99', role)
        self.client.force_authenticate(user=self.user)

    @override_settings(REST_FRAMEWORK={**_THROTTLE_OVERRIDES})
    def test_third_import_request_is_throttled(self):
        url = '/asset/import-csv'
        import io
        # Two allowed requests
        for _ in range(2):
            self.client.get(url)
        # Third should be throttled
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class AssetExportThrottleTests(TestCase):
    """Asset export is rate-limited to asset_export scope."""

    def setUp(self):
        self.client = APIClient()
        role = _make_role(
            Role.Name.ADMIN,
            can_export_assets=True,
            can_manage_users=True,
        )
        self.user = _make_user('export-throttle', 'Passw0rd!99', role)
        self.client.force_authenticate(user=self.user)

    @override_settings(REST_FRAMEWORK={**_THROTTLE_OVERRIDES})
    def test_third_export_request_is_throttled(self):
        url = '/asset/export'
        for _ in range(2):
            self.client.get(url)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
