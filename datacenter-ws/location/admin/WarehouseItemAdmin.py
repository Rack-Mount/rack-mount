from django.contrib import admin
from location.models import WarehouseItem


@admin.register(WarehouseItem)
class WarehouseItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'specs', 'quantity', 'unit', 'min_threshold', 'below_threshold', 'warehouse']
    list_filter = ['category', 'unit', 'warehouse']
    search_fields = ['name', 'specs', 'notes']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['category', 'name']

    @admin.display(boolean=True, description='Sotto soglia')
    def below_threshold(self, obj):
        return obj.below_threshold
