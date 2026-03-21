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


# ── Base classes ──────────────────────────────────────────────────────────────

class _RolePermission(permissions.BasePermission):
    """
    Base for all role-based permissions.
    Assumes ``IsAuthenticated`` is listed before this class in
    ``permission_classes`` — the auth guard is therefore skipped here to
    avoid a redundant DB hit.
    """

    def _role(self, request: Request):
        return _get_role(request)


class _RoleFlagPermission(_RolePermission):
    """
    Simple single-flag permission: ``has_permission`` returns True iff the role
    has the attribute named by ``flag`` set to a truthy value.
    Subclasses must define ``flag: str``.
    """
    flag: str = ''

    def has_permission(self, request: Request, view) -> bool:
        role = self._role(request)
        return role is not None and bool(getattr(role, self.flag, False))


class _MethodRouterPermission(_RolePermission):
    """
    Route HTTP method to a role flag.
    Subclasses define: ``safe_attr``, ``create_attr``, ``edit_attr``, ``delete_attr``.
    """
    safe_attr: str = ''
    create_attr: str = ''
    edit_attr: str = ''
    delete_attr: str = ''

    def has_permission(self, request: Request, view) -> bool:
        role = self._role(request)
        if role is None:
            return False
        if request.method in permissions.SAFE_METHODS:
            return bool(getattr(role, self.safe_attr, False))
        attr = {
            'POST': self.create_attr,
            'PUT': self.edit_attr,
            'PATCH': self.edit_attr,
            'DELETE': self.delete_attr,
        }.get(request.method, '')
        return bool(getattr(role, attr, False)) if attr else False


# ── Role check ────────────────────────────────────────────────────────────────

class IsAdminRole(_RolePermission):
    """Allow access only to users with the 'admin' role."""

    def has_permission(self, request: Request, view) -> bool:
        from accounts.models import Role
        role = self._role(request)
        return role is not None and role.name == Role.Name.ADMIN


# ── Per-section permission classes ────────────────────────────────────────────

class AssetResourcePermission(_MethodRouterPermission):
    """
    Granular per-method permission for the Assets section.
    GET/HEAD/OPTIONS → can_view_assets
    POST             → can_create_assets
    PUT/PATCH        → can_edit_assets
    DELETE           → can_delete_assets
    """
    safe_attr = 'can_view_assets'
    create_attr = 'can_create_assets'
    edit_attr = 'can_edit_assets'
    delete_attr = 'can_delete_assets'


class CloneAssetPermission(_RoleFlagPermission):
    """Required for the asset clone / bulk_clone custom actions."""
    flag = 'can_clone_assets'


class EditAssetPermission(_RoleFlagPermission):
    """Used for write-only asset actions (e.g. bulk_state)."""
    flag = 'can_edit_assets'


class ImportAssetsPermission(_RoleFlagPermission):
    """Required for the asset CSV import view."""
    flag = 'can_import_assets'


class ExportAssetsPermission(_RoleFlagPermission):
    """Required for the asset export view."""
    flag = 'can_export_assets'


class DeleteAssetPermission(_RoleFlagPermission):
    """Required for the asset bulk_delete custom action."""
    flag = 'can_delete_assets'


class CatalogResourcePermission(_MethodRouterPermission):
    """
    Granular per-method permission for the Catalog section
    (vendors, asset models, generic components, states, types, custom fields).
    GET/HEAD/OPTIONS → can_view_catalog
    POST             → can_create_catalog
    PUT/PATCH        → can_edit_catalog
    DELETE           → can_delete_catalog
    """
    safe_attr = 'can_view_catalog'
    create_attr = 'can_create_catalog'
    edit_attr = 'can_edit_catalog'
    delete_attr = 'can_delete_catalog'


class AssetLookupPermission(_MethodRouterPermission):
    """
    Permission for catalog lookup tables that are also consumed by the Assets
    section (AssetType, AssetState).  These records need to be readable by
    anyone who can see assets OR the catalog.
    GET/HEAD/OPTIONS → can_view_assets OR can_view_catalog
    POST             → can_create_catalog
    PUT/PATCH        → can_edit_catalog
    DELETE           → can_delete_catalog
    """
    # Non-safe attrs reuse parent routing
    create_attr = 'can_create_catalog'
    edit_attr = 'can_edit_catalog'
    delete_attr = 'can_delete_catalog'

    def has_permission(self, request: Request, view) -> bool:
        role = self._role(request)
        if role is None:
            return False
        if request.method in permissions.SAFE_METHODS:
            return bool(role.can_view_assets) or bool(role.can_view_catalog)
        return super().has_permission(request, view)


class DeleteCatalogPermission(_RoleFlagPermission):
    """Required for catalog bulk delete actions."""
    flag = 'can_delete_catalog'


class ImportCatalogPermission(_RoleFlagPermission):
    """Required for the asset-model CSV import view."""
    flag = 'can_import_catalog'


class RackResourcePermission(_MethodRouterPermission):
    """
    Granular per-method permission for Infrastructure
    (racks, rack units, rack types, locations, rooms).
    GET/HEAD/OPTIONS → can_view_infrastructure
    POST             → can_create_racks
    PUT/PATCH        → can_edit_racks
    DELETE           → can_delete_racks
    """
    safe_attr = 'can_view_infrastructure'
    create_attr = 'can_create_racks'
    edit_attr = 'can_edit_racks'
    delete_attr = 'can_delete_racks'


class MapEditPermission(_RolePermission):
    """
    Required for floor-plan / room editing.
    GET/HEAD/OPTIONS → can_view_infrastructure
    any mutation     → can_edit_map
    """

    def has_permission(self, request: Request, view) -> bool:
        role = self._role(request)
        if role is None:
            return False
        if request.method in permissions.SAFE_METHODS:
            return bool(role.can_view_infrastructure)
        return bool(role.can_edit_map)
