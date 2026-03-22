"""
Tests for asset app functionality.
"""
import time
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role
from asset.utils.signed_url import generate_signed_url, verify_signed_url


class SignedURLTestCase(TestCase):
    """Test signed URL generation and verification."""

    @override_settings(SIGNED_URL_SECRET='test-secret-key')
    @override_settings(SIGNED_URL_EXPIRY_SECONDS=3600)
    def test_generate_signed_url(self):
        """Test that signed URLs are generated correctly."""
        url = generate_signed_url('training/sample.jpg')

        # URL should contain the filename and query parameters
        self.assertIn('/files/private/training/sample.jpg', url)
        self.assertIn('?', url)
        self.assertIn('sign=', url)
        self.assertIn('expire=', url)

    @override_settings(SIGNED_URL_SECRET='test-secret-key')
    @override_settings(SIGNED_URL_EXPIRY_SECONDS=3600)
    def test_verify_valid_signed_url(self):
        """Test that valid signatures are accepted."""
        filename = 'training/sample.jpg'
        url = generate_signed_url(filename)

        # Extract signature and expiry from URL
        query_string = url.split('?')[1]
        params = dict(p.split('=') for p in query_string.split('&'))

        is_valid, error = verify_signed_url(
            filename,
            params['sign'],
            params['expire']
        )

        self.assertTrue(is_valid)
        self.assertIsNone(error)

    @override_settings(SIGNED_URL_SECRET='test-secret-key')
    @override_settings(SIGNED_URL_EXPIRY_SECONDS=3600)
    def test_verify_tampered_signature(self):
        """Test that tampered signatures are rejected."""
        filename = 'training/sample.jpg'
        url = generate_signed_url(filename)

        # Extract signature and expiry
        query_string = url.split('?')[1]
        params = dict(p.split('=') for p in query_string.split('&'))

        # Tamper with the signature
        tampered_sig = params['sign'][:-4] + 'xxxx'

        is_valid, error = verify_signed_url(
            filename,
            tampered_sig,
            params['expire']
        )

        self.assertFalse(is_valid)
        self.assertIn('tampered', error.lower())

    @override_settings(SIGNED_URL_SECRET='test-secret-key')
    def test_verify_expired_signature(self):
        """Test that expired signatures are rejected."""
        filename = 'training/sample.jpg'

        # Generate a signature that expired 1 second ago
        expire_ts = int(time.time()) - 1

        is_valid, error = verify_signed_url(
            filename,
            'dummy_sig',
            str(expire_ts)
        )

        self.assertFalse(is_valid)
        self.assertIn('expired', error.lower())

    @override_settings(SIGNED_URL_SECRET='test-secret-key')
    def test_verify_invalid_timestamp_format(self):
        """Test that invalid timestamp formats are rejected."""
        filename = 'training/sample.jpg'

        is_valid, error = verify_signed_url(
            filename,
            'dummy_sig',
            'not-a-timestamp'
        )

        self.assertFalse(is_valid)
        self.assertIn('invalid', error.lower())


class PrivateMediaSignedUrlEndpointTestCase(TestCase):
    """Test /asset/private-media-url endpoint security and behavior."""

    def setUp(self):
        self.client = APIClient()
        self.url = '/asset/private-media-url'

        self.role = Role.objects.create(
            name='endpoint_test_role',
            can_view_model_training_status=True,
        )
        self.user = User.objects.create_user(
            username='signed-url-user',
            password='test-pass-123',
        )
        self.user.profile.role = self.role
        self.user.profile.save(update_fields=['role'])

    def test_requires_authentication(self):
        response = self.client.post(
            self.url,
            {'filename': 'private/training/sample.jpg'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rejects_user_without_permission(self):
        denied_role = Role.objects.create(
            name='endpoint_denied_role',
            can_view_model_training_status=False,
        )
        denied_user = User.objects.create_user(
            username='signed-url-denied',
            password='test-pass-123',
        )
        denied_user.profile.role = denied_role
        denied_user.profile.save(update_fields=['role'])

        self.client.force_authenticate(user=denied_user)
        response = self.client.post(
            self.url,
            {'filename': 'private/training/sample.jpg'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(SIGNED_URL_SECRET='test-secret-key', SIGNED_URL_EXPIRY_SECONDS=3600)
    def test_generates_signed_url_for_private_path(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self.url,
            {'filename': 'private/training/sample.jpg', 'expiry_seconds': 120},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('url', response.data)
        self.assertIn('/files/private/training/sample.jpg',
                      response.data['url'])
        self.assertEqual(response.data['expiry_seconds'], 120)

    @override_settings(SIGNED_URL_SECRET='test-secret-key', SIGNED_URL_EXPIRY_SECONDS=3600)
    def test_rejects_non_private_path(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self.url,
            {'filename': 'public/components/sample.jpg'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(SIGNED_URL_SECRET='test-secret-key', SIGNED_URL_EXPIRY_SECONDS=3600)
    def test_clamps_expiry_to_max_configured(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self.url,
            {'filename': 'private/training/sample.jpg', 'expiry_seconds': 999999},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['expiry_seconds'], 3600)
