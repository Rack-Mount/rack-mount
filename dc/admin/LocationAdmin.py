from django.contrib import admin

from dc.admin import LocationCustomFieldInline
from dc.models import Location


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    save_on_top = True
    fields = [
        ('name', 'short_name'),
        ('location'),
        ('manager', 'manager_mail'),
        ('capacity'),
        ('operational_since'),
    ]

    list_display = (
        'name',
        'short_name',
        'location',
        'capacity',
        'operational_since'
    )
    search_fields = ['name', 'location']
    readonly_fields = ['operational_since']
    inlines = [LocationCustomFieldInline]
