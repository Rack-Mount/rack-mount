from django.contrib import admin

from asset.models import AssetCustomField
from reversion.admin import VersionAdmin


class AssetCustomFieldInline(admin.TabularInline):
    model = AssetCustomField
    fields = ['field_name', 'field_value']
    extra = 1
    list_per_page = 12


@admin.register(AssetCustomField)
class AssetCustomFieldAdmin(VersionAdmin):
    save_on_top = True
    fields = [
        ('asset'), ('field_name', 'field_value'),
    ]

    list_display = (
        'asset',
        'field_name',
        'field_value'
    )
    search_fields = ['asset__name', 'field_name']
    ordering = ('asset', 'field_name')

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return True
