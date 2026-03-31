"""
accounts/views/__init__.py
--------------------------
Re-exports all view classes so existing import sites continue to work
unchanged after the module was split into sub-modules:

  - ``accounts/urls.py``         → UserManagementViewSet, RoleListView,
                                    ChangePasswordView, UserPreferencesView,
                                    LogoutView
  - ``datacenter-app/urls.py``   → CookieTokenObtainView,
                                    CookieTokenRefreshView,
                                    CookieTokenBlacklistView
"""

from accounts.views.auth_views import (   # noqa: F401
    CookieTokenBlacklistView,
    CookieTokenObtainView,
    CookieTokenRefreshView,
    LogoutView,
)
from accounts.views.user_views import (   # noqa: F401
    ChangePasswordView,
    RoleListView,
    UserManagementViewSet,
    UserPreferencesView,
)

__all__ = [
    # auth
    'CookieTokenObtainView',
    'CookieTokenRefreshView',
    'CookieTokenBlacklistView',
    'LogoutView',
    # user management
    'UserManagementViewSet',
    'RoleListView',
    'ChangePasswordView',
    'UserPreferencesView',
]
