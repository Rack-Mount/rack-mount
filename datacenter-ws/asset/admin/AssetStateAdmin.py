from django.contrib import admin
from asset.models import AssetState


@admin.register(AssetState)
class AssetStateAdmin(admin.ModelAdmin):
    save_on_top = True

    list_display = ('name', 'description',)
    search_fields = ('name', 'description')
    ordering = ('name',)

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return False

    def has_change_permission(self, request, obj=...):
        return False
