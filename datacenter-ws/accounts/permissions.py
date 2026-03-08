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


# ── Per-section permission classes ────────────────────────────────────────────

class AssetResourcePermission(permissions.BasePermission):
    """
    Granular per-method permission for the Assets section.
    GET/HEAD/OPTIONS → can_view_assets
    POST             → can_create_assets
    PUT/PATCH        → can_edit_assets
    DELETE           → can_delete_assets
    """

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        if role is None:
            return False
        if request.method in permissions.SAFE_METHODS:
            return bool(role.can_view_assets)
        if request.method == 'DELETE':
            return bool(role.can_delete_assets)
        if request.method in ('PUT', 'PATCH'):
            return bool(role.can_edit_assets)
        if request.method == 'POST':
            return bool(role.can_create_assets)
        return False


class CloneAssetPermission(permissions.BasePermission):
    """Required for the asset clone / bulk_clone custom actions."""

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        return role is not None and bool(role.can_clone_assets)


class EditAssetPermission(permissions.BasePermission):
    """Used for write-only asset actions (e.g. bulk_state)."""

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        return role is not None and bool(role.can_edit_assets)


class ImportAssetsPermission(permissions.BasePermission):
    """Required for the asset CSV import view."""

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        return role is not None and bool(role.can_import_assets)


class ExportAssetsPermission(permissions.BasePermission):
    """Required for the asset export view."""

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        return role is not None and bool(role.can_export_assets)


class DeleteAssetPermission(permissions.BasePermission):
    """Required for the asset bulk_delete custom action."""

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        return role is not None and bool(role.can_delete_assets)


class CatalogResourcePermission(permissions.BasePermission):
    """
    Granular per-method permission for the Catalog section
    (vendors, asset models, generic components, states, types, custom fields).
    GET/HEAD/OPTIONS → can_view_catalog
    POST             → can_create_catalog
    PUT/PATCH        → can_edit_catalog
    DELETE           → can_delete_catalog
    """

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        if role is None:
            return False
        if request.method in permissions.SAFE_METHODS:
            return bool(role.can_view_catalog)
        if request.method == 'DELETE':
            return bool(role.can_delete_catalog)
        if request.method in ('PUT', 'PATCH'):
            return bool(role.can_edit_catalog)
        if request.method == 'POST':
            return bool(role.can_create_catalog)
        return False


class AssetLookupPermission(permissions.BasePermission):
    """
    Permission for catalog lookup tables that are also consumed by the Assets
    section (AssetType, AssetState).  These records need to be readable by
    anyone who can see assets OR the catalog.
    GET/HEAD/OPTIONS → can_view_assets OR can_view_catalog
    POST             → can_create_catalog
    PUT/PATCH        → can_edit_catalog
    DELETE           → can_delete_catalog
    """

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        if role is None:
            return False
        if request.method in permissions.SAFE_METHODS:
            return bool(role.can_view_assets) or bool(role.can_view_catalog)
        if request.method == 'DELETE':
            return bool(role.can_delete_catalog)
        if request.method in ('PUT', 'PATCH'):
            return bool(role.can_edit_catalog)
        if request.method == 'POST':
            return bool(role.can_create_catalog)
        return False


class DeleteCatalogPermission(permissions.BasePermission):
    """Required for catalog bulk delete actions."""

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        return role is not None and bool(role.can_delete_catalog)


class ImportCatalogPermission(permissions.BasePermission):
    """Required for the asset-model CSV import view."""

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        return role is not None and bool(role.can_import_catalog)


class RackResourcePermission(permissions.BasePermission):
    """
    Granular per-method permission for Infrastructure
    (racks, rack units, rack types, locations, rooms).
    GET/HEAD/OPTIONS → can_view_infrastructure
    POST             → can_create_racks
    PUT/PATCH        → can_edit_racks
    DELETE           → can_delete_racks
    """

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        if role is None:
            return False
        if request.method in permissions.SAFE_METHODS:
            return bool(role.can_view_infrastructure)
        if request.method == 'DELETE':
            return bool(role.can_delete_racks)
        if request.method in ('PUT', 'PATCH'):
            return bool(role.can_edit_racks)
        if request.method == 'POST':
            return bool(role.can_create_racks)
        return False


class MapEditPermission(permissions.BasePermission):
    """
    Required for floor-plan / room editing.
    GET/HEAD/OPTIONS → can_view_infrastructure
    any mutation     → can_edit_map
    """

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        role = _get_role(request)
        if role is None:
            return False
        if request.method in permissions.SAFE_METHODS:
            return bool(role.can_view_infrastructure)
        return bool(role.can_edit_map)
