from django.contrib import admin
from asset.models import AssetType


@admin.register(AssetType)
class AssetTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'description')
    search_fields = ('name',)
    list_filter = ('name',)
    ordering = ('name',)

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return False

    def has_change_permission(self, request, obj=...):
        return False
