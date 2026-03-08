from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from django.utils.html import format_html, mark_safe
from django.utils.translation import gettext_lazy as _
from .models import Role, UserProfile


# ── Inline: embed UserProfile inside the User add/change form ─────────────────

class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name = _('Profile')
    verbose_name_plural = _('Profile')
    autocomplete_fields = ('role',)
    extra = 1  # show 1 empty row when the profile does not exist yet


# ── Re-register User with the profile inline ──────────────────────────────────

admin.site.unregister(User)


@admin.register(User)
class UserAdminWithProfile(BaseUserAdmin):
    inlines = (UserProfileInline,)


# ── Role admin ────────────────────────────────────────────────────────────────

_ROLE_COLORS = {
    'admin':  ('#c0392b', '#fff'),
    'editor': ('#d68910', '#fff'),
    'viewer': ('#1a6fa8', '#fff'),
    'guest':  ('#7f8c8d', '#fff'),
}


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    # Required so autocomplete_fields = ('role',) works on inlines/related admins
    search_fields = ('name',)
    ordering = ('name',)
    list_filter = ('name',)

    list_display = (
        'colored_name',
        'assets_summary',
        'catalog_summary',
        'infrastructure_summary',
        'can_manage_users',
        'user_count',
    )

    def get_readonly_fields(self, request, obj=None):
        if obj is not None:
            return ('name',)
        return ()

    fieldsets = (
        (None, {
            'fields': ('name',),
        }),
        (_('Assets'), {
            'fields': (
                'can_view_assets',
                ('can_create_assets', 'can_edit_assets', 'can_delete_assets'),
                ('can_import_assets', 'can_export_assets', 'can_clone_assets'),
            ),
        }),
        (_('Catalog'), {
            'fields': (
                'can_view_catalog',
                ('can_create_catalog', 'can_edit_catalog', 'can_delete_catalog'),
                'can_import_catalog',
            ),
        }),
        (_('Infrastructure'), {
            'fields': (
                'can_view_infrastructure',
                ('can_create_racks', 'can_edit_racks', 'can_delete_racks'),
                'can_edit_map',
            ),
        }),
        (_('Administration'), {
            'fields': ('can_manage_users',),
        }),
    )

    # ── Custom list columns ────────────────────────────────────────────────────

    @admin.display(description=_('Role'), ordering='name')
    def colored_name(self, obj):
        bg, fg = _ROLE_COLORS.get(obj.name, ('#555', '#fff'))
        return format_html(
            '<span style="background:{bg};color:{fg};padding:2px 10px;'
            'border-radius:4px;font-weight:600;letter-spacing:.03em">'
            '{label}</span>',
            bg=bg, fg=fg, label=obj.get_name_display(),
        )

    @admin.display(description=_('Assets'))
    def assets_summary(self, obj):
        return self._perm_chips([
            ('view',         obj.can_view_assets),
            ('create',       obj.can_create_assets),
            ('edit',         obj.can_edit_assets),
            ('delete',       obj.can_delete_assets),
            ('import', obj.can_import_assets),
            ('export', obj.can_export_assets),
            ('clone',        obj.can_clone_assets),
        ])

    @admin.display(description=_('Catalog'))
    def catalog_summary(self, obj):
        return self._perm_chips([
            ('view',   obj.can_view_catalog),
            ('create', obj.can_create_catalog),
            ('edit',   obj.can_edit_catalog),
            ('delete', obj.can_delete_catalog),
            ('import', obj.can_import_catalog),
        ])

    @admin.display(description=_('Infrastructure'))
    def infrastructure_summary(self, obj):
        return self._perm_chips([
            ('view',         obj.can_view_infrastructure),
            ('create racks', obj.can_create_racks),
            ('edit racks',   obj.can_edit_racks),
            ('delete racks', obj.can_delete_racks),
            ('edit map',     obj.can_edit_map),
        ])

    @admin.display(description=_('Users'), ordering='user_profiles__count')
    def user_count(self, obj):
        return obj.user_profiles.count()

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('user_profiles')

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _perm_chips(flags):
        active = [label for label, value in flags if value]
        if not active:
            return mark_safe('<span style="color:#bbb;font-style:italic">none</span>')
        return mark_safe(' '.join(
            format_html(
                '<span style="background:#e8f0fe;color:#1a6fa8;padding:1px 6px;'
                'border-radius:3px;font-size:.8em;white-space:nowrap">{}</span>',
                label,
            )
            for label in active
        ))


# ── UserProfile admin (standalone, for direct access) ─────────────────────────

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')
    list_select_related = ('user', 'role')
    list_filter = ('role',)
    search_fields = ('user__username', 'user__email')
    autocomplete_fields = ('user', 'role')
