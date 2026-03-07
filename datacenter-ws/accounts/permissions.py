from rest_framework import permissions
from rest_framework.request import Request


def _get_role(request: Request):
    """Return the UserProfile.role for the authenticated user, or None."""
    user = request.user
    if not user or not user.is_authenticated:
        return None
    try:
        return user.profile.role
    except Exception:
        return None


class IsAdminRole(permissions.BasePermission):
    """Allow access only to users with the 'admin' role."""

    def has_permission(self, request: Request, view) -> bool:
        role = _get_role(request)
        return role is not None and role.name == 'admin'


class IsEditorOrAbove(permissions.BasePermission):
    """Allow access to 'admin' and 'editor' roles."""

    def has_permission(self, request: Request, view) -> bool:
        role = _get_role(request)
        return role is not None and role.name in ('admin', 'editor')


class RoleBasedModelPermission(permissions.BasePermission):
    """
    Read-only for Viewer and Guest; full write access for Editor and Admin.

    Safe methods (GET, HEAD, OPTIONS) pass through for any authenticated user.
    Mutating methods are checked against role.can_* flags.
    """

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        role = _get_role(request)
        if role is None:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        if request.method == 'DELETE':
            return bool(role.can_delete)
        if request.method in ('PUT', 'PATCH'):
            return bool(role.can_edit)
        if request.method == 'POST':
            return bool(role.can_create)

        return False
