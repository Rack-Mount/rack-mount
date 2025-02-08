from django.contrib import admin
from asset.models import Asset
from asset.admin import AssetCustomFieldInline


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ('hostname', 'asset_type', 'model', 'vendor',
                    'rack_units', 'location', 'state', 'purchase_date')
    search_fields = ('hostname', 'asset_type')
    list_filter = ('asset_type',)
    ordering = ('-purchase_date',)
    inlines = [AssetCustomFieldInline]
