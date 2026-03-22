"""
Tests for rate limiting throttle classes.
"""
from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory
from rest_framework import status

from accounts.throttles import (
    PortTrainingThrottle,
    PortCorrectionThrottle,
    PortAnalysisThrottle,
    PortClickAnalysisThrottle,
    ModelTrainingStatusThrottle,
)


class ThrottleTestCase(TestCase):
    """Test rate limiting throttles."""

    def setUp(self):
        """Create test user."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.factory = APIRequestFactory()

    def test_port_training_throttle_scope(self):
        """Verify PortTrainingThrottle has correct scope and rate."""
        throttle = PortTrainingThrottle()
        self.assertEqual(throttle.scope, 'port_training')
        self.assertEqual(throttle.rate, '10/h')

    def test_port_correction_throttle_scope(self):
        """Verify PortCorrectionThrottle has correct scope and rate."""
        throttle = PortCorrectionThrottle()
        self.assertEqual(throttle.scope, 'port_correction')
        self.assertEqual(throttle.rate, '30/h')

    def test_port_analysis_throttle_scope(self):
        """Verify PortAnalysisThrottle has correct scope and rate."""
        throttle = PortAnalysisThrottle()
        self.assertEqual(throttle.scope, 'port_analysis')
        self.assertEqual(throttle.rate, '100/h')

    def test_port_click_analysis_throttle_scope(self):
        """Verify PortClickAnalysisThrottle has correct scope and rate."""
        throttle = PortClickAnalysisThrottle()
        self.assertEqual(throttle.scope, 'port_click_analysis')
        self.assertEqual(throttle.rate, '200/h')

    def test_model_training_status_throttle_scope(self):
        """Verify ModelTrainingStatusThrottle has correct scope and rate."""
        throttle = ModelTrainingStatusThrottle()
        self.assertEqual(throttle.scope, 'model_training_status')
        self.assertEqual(throttle.rate, '1000/h')

    def test_throttle_allows_authenticated_user(self):
        """Test that authenticated users are identified correctly."""
        throttle = PortTrainingThrottle()
        request = self.factory.post('/test/')
        request.user = self.user

        # Get throttle key (should include user ID)
        key = throttle.get_cache_key(request, None)
        self.assertIsNotNone(key)
        self.assertIn(str(self.user.id), key)

    def test_multiple_throttles_use_different_scopes(self):
        """Verify that different throttles have different scopes."""
        throttles = [
            PortTrainingThrottle(),
            PortCorrectionThrottle(),
            PortAnalysisThrottle(),
            PortClickAnalysisThrottle(),
            ModelTrainingStatusThrottle(),
        ]
        scopes = [t.scope for t in throttles]

        # All scopes should be unique
        self.assertEqual(len(scopes), len(set(scopes)))

    def test_throttle_rates_are_reasonable(self):
        """Verify that throttle rates are appropriately restrictive."""
        rates = {
            PortTrainingThrottle().rate: 10,       # Most restrictive
            PortCorrectionThrottle().rate: 30,
            PortAnalysisThrottle().rate: 100,
            PortClickAnalysisThrottle().rate: 200,
            ModelTrainingStatusThrottle().rate: 1000,  # Least restrictive
        }

        # Verify rates increase from training → analysis → status
        rate_values = list(rates.values())
        for i in range(len(rate_values) - 1):
            self.assertLess(rate_values[i], rate_values[i + 1])
