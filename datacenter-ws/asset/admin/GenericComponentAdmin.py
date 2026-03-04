from django.contrib import admin
from asset.models import GenericComponent


@admin.register(GenericComponent)
class GenericComponentAdmin(admin.ModelAdmin):
    list_display = ('name', 'component_type', 'rack_units',
                    'created_at', 'updated_at')
    list_filter = ('component_type',)
    search_fields = ('name', 'note')
    ordering = ('component_type', 'name')
