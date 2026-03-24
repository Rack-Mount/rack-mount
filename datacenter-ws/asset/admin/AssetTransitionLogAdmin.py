from django.contrib import admin
from asset.models import AssetTransitionLog


@admin.register(AssetTransitionLog)
class AssetTransitionLogAdmin(admin.ModelAdmin):
    list_display = ['asset', 'from_state', 'to_state', 'from_room', 'to_room', 'user', 'timestamp']
    list_filter = ['to_state', 'from_state']
    search_fields = ['asset__hostname', 'asset__serial_number', 'notes']
    readonly_fields = ['asset', 'from_state', 'to_state', 'from_room', 'to_room', 'user', 'notes', 'timestamp']
    ordering = ['-timestamp']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
