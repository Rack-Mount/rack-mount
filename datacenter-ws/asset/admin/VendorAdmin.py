from django.contrib import admin
from asset.models import Vendor


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    save_on_top = True

    list_display = ('name', 'created_at', 'updated_at')
    search_fields = ('name',)
    list_filter = ('name',)
    ordering = ('name',)

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return False
