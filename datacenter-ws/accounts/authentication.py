# JWT authentication is handled by the standard JWTAuthentication class from
# rest_framework_simplejwt, which reads the token from the Authorization header.
#
# This module is kept for import compatibility; no custom logic is needed.
from rest_framework_simplejwt.authentication import JWTAuthentication  # noqa: F401
