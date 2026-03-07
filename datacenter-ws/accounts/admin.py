from django.contrib import admin
from .models import Role, UserProfile


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'can_create', 'can_edit', 'can_delete',
                    'can_import_export', 'can_access_assets', 'can_access_catalog', 'can_manage_users')
    list_editable = ('can_create', 'can_edit', 'can_delete',
                     'can_import_export', 'can_access_assets', 'can_access_catalog', 'can_manage_users')


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')
    list_select_related = ('user', 'role')
    raw_id_fields = ('user',)
