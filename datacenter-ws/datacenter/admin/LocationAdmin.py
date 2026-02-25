from django.contrib import admin
from reversion.admin import VersionAdmin

from datacenter.admin import LocationCustomFieldInline
from datacenter.admin.RoomAdmin import RoomInline
from datacenter.models import Location


@admin.register(Location)
class LocationAdmin(VersionAdmin):
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
    ordering = ('name',)
    inlines = [LocationCustomFieldInline, RoomInline]

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return False

    def has_change_permission(self, request, obj=...):
        return True
