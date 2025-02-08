from django.contrib import admin
from asset.models import Asset
from asset.admin import AssetCustomFieldInline
from asset.models import AssetModel
from reversion.admin import VersionAdmin


@admin.register(Asset)
class AssetAdmin(VersionAdmin):
    save_on_top = True
    list_display = ('hostname', 'model__type', 'model__name', 'model__vendor',
                    'model__rack_units', 'location', 'state', 'purchase_date')
    search_fields = ('hostname', 'model__type__name', 'model',)
    list_filter = ('model__type__name',)
    ordering = ('hostname',)
    inlines = [AssetCustomFieldInline]
    autocomplete_fields = ['model', 'location']

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return False
