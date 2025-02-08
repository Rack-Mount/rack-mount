from django.contrib import admin
from asset.models import AssetState


@admin.register(AssetState)
class AssetStateAdmin(admin.ModelAdmin):
    list_display = ('name', 'description',
                    'created_at', 'updated_at')
    search_fields = ('name', 'description')
    list_filter = ('created_at', 'updated_at')
    ordering = ('name',)
