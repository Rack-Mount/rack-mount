from django.contrib import admin
from .models import Role, UserProfile


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'can_view_assets', 'can_create_assets', 'can_edit_assets',
        'can_delete_assets', 'can_import_export_assets', 'can_clone_assets',
        'can_view_catalog', 'can_create_catalog', 'can_edit_catalog',
        'can_delete_catalog', 'can_import_catalog',
        'can_create_racks', 'can_edit_racks', 'can_delete_racks', 'can_edit_map',
        'can_manage_users',
    )
    list_editable = (
        'can_view_assets', 'can_create_assets', 'can_edit_assets',
        'can_delete_assets', 'can_import_export_assets', 'can_clone_assets',
        'can_view_catalog', 'can_create_catalog', 'can_edit_catalog',
        'can_delete_catalog', 'can_import_catalog',
        'can_create_racks', 'can_edit_racks', 'can_delete_racks', 'can_edit_map',
        'can_manage_users',
    )


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')
    list_select_related = ('user', 'role')
    raw_id_fields = ('user',)
