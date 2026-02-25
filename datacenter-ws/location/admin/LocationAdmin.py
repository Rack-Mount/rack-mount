from django.contrib import admin
from reversion.admin import VersionAdmin

from location.admin import LocationCustomFieldInline
from location.admin.RoomAdmin import RoomInline
from location.models import Location


@admin.register(Location)
class LocationAdmin(VersionAdmin):
    save_on_top = True
    fields = [
        ('name', 'short_name'),
        ('location'),
        ('operational_since'),
    ]

    list_display = (
        'name',
        'short_name',
        'location',
        'operational_since'
    )
    search_fields = ['name', 'location']
    readonly_fields = ['operational_since']
    ordering = ('name',)
    inlines = [LocationCustomFieldInline, RoomInline]

    def has_change_permission(self, request, obj=...):
        return True
