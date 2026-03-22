from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import TokenError


class CookieJWTAuthentication(JWTAuthentication):
    """
    Authenticate JWT from HttpOnly cookie when Authorization header is absent.
    """

    def authenticate(self, request):
        header = self.get_header(request)

        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is None:
                return None
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        else:
            raw_token = request.COOKIES.get('access_token')
            if raw_token is not None:
                self._enforce_csrf(request)
                try:
                    validated_token = self.get_validated_token(raw_token)
                    return self.get_user(validated_token), validated_token
                except TokenError:
                    # Invalid/expired cookie token should not break AllowAny views.
                    return None

        return None

    @staticmethod
    def _enforce_csrf(request):
        """Require a valid CSRF token when JWT is supplied via cookie."""
        check = CSRFCheck(lambda req: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f'CSRF Failed: {reason}')
