from django.contrib import admin
from asset.models import Asset
from asset.admin import AssetCustomFieldInline
from reversion.admin import VersionAdmin


@admin.register(Asset)
class AssetAdmin(VersionAdmin):
    save_on_top = True
    list_display = ('hostname', 'type', 'model', 'vendor',
                    'rack_units', 'location', 'state', 'purchase_date')
    search_fields = ('hostname', 'type__name', 'model',)
    list_filter = ('type',)
    ordering = ('-purchase_date',)
    inlines = [AssetCustomFieldInline]

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return False
