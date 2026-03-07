"""
RoleBasedViewSetMixin — apply to any ModelViewSet to enforce role-based
read/write restrictions based on the authenticated user's role.
"""
from accounts.permissions import RoleBasedModelPermission


class RoleBasedViewSetMixin:
    """
    Override get_permissions() to inject RoleBasedModelPermission in addition
    to any permissions already declared on the viewset.
    """

    def get_permissions(self):
        base = super().get_permissions()
        return [*base, RoleBasedModelPermission()]
