from django.conf import settings
from rest_framework import permissions

# Trusted reverse-proxy addresses (only these may set X-Forwarded-For).
_TRUSTED_PROXIES = frozenset({'127.0.0.1', '::1'})


def get_client_ip(request):
    """Return the real client IP.

    X-Forwarded-For is only honoured when the direct TCP peer is a trusted
    reverse proxy, preventing IP-spoofing by external clients.
    """
    remote_addr = request.META.get('REMOTE_ADDR', '')
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for and remote_addr in _TRUSTED_PROXIES:
        # Take the left-most (client) address from the chain.
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = remote_addr
    return ip


class AccessListPermission(permissions.BasePermission):
    """
    Global permission check for blocked IPs.
    """

    def has_permission(self, request, view):
        ip_addr = get_client_ip(request)
        return ip_addr in settings.ACCESS_LIST
