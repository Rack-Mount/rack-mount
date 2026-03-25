from rest_framework.throttling import AnonRateThrottle


class LoginAnonThrottle(AnonRateThrottle):
    """
    Throttle for anonymous login attempts (username + password).
    Uses a dedicated 'login_anon' scope — separate from the general
    anon bucket — so brute-force attempts don't block other anonymous traffic.
    """
    scope = 'login_anon'


class TokenRefreshThrottle(AnonRateThrottle):
    """
    Throttle for the token-refresh endpoint.
    Needs a much higher limit than the login endpoint because the
    frontend calls it automatically whenever the access token expires
    (every 15 min) and on every page reload.
    """
    scope = 'token_refresh'
