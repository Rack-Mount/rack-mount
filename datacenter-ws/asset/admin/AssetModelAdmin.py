from django.contrib import admin
from asset.models import AssetModel
from reversion.admin import VersionAdmin


@admin.register(AssetModel)
class AssetModelAdmin(VersionAdmin):
    save_on_top = True
    list_display = ('name', 'type', 'vendor',
                    'front_image_preview', 'rack_units')
    search_fields = ('name', 'type__name', 'vendor__name')
    list_filter = ('type', 'vendor')
    ordering = ('name',)
    autocomplete_fields = ['vendor', 'type']
    readonly_fields = ['front_image_preview', 'rear_image_preview']

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return False
