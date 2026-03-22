"""
Tests for asset app functionality.
"""
import time
from django.test import TestCase, override_settings
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
