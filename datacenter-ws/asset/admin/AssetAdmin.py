from django.contrib import admin
from asset.models import Asset
from asset.admin import AssetCustomFieldInline
from reversion.admin import VersionAdmin


@admin.register(Asset)
class AssetAdmin(VersionAdmin):
    save_on_top = True
    save_as = True

    list_display = ('hostname', 'model__type', 'model__name', 'model__vendor',
                    'serial_number', 'sap_id', 'model__rack_units', 'power_cosumption_watt', 'location', 'state', 'purchase_date')
    search_fields = ('hostname', 'model__type__name',
                     'model__name', 'serial_number', 'sap_id')
    list_filter = ('model__type__name', 'model__vendor',
                   'location__name', 'state')
    ordering = ('hostname',)
    inlines = [AssetCustomFieldInline]
    autocomplete_fields = ['model', 'location']

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return True
