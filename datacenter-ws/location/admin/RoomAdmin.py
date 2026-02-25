from django.contrib import admin
from reversion.admin import VersionAdmin
from location.models import Room


class RoomInline(admin.TabularInline):
    model = Room
    extra = 0
    fields = ['name', 'floor', 'capacity', 'manager', 'manager_mail', 'description', 'floor_plan']
    show_change_link = True


@admin.register(Room)
class RoomAdmin(VersionAdmin):
    save_on_top = True
    fields = [
        ('location',),
        ('name', 'floor'),
        ('capacity',),
        ('manager', 'manager_mail'),
        ('description',),
        ('floor_plan',),
    ]

    list_display = (
        'name',
        'location',
        'floor',
        'capacity',
        'manager',
        'created_at',
        'updated_at',
    )
    list_filter = ('location',)
    search_fields = ['name', 'location__name']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ('location', 'name')

    def has_delete_permission(self, request, obj=None):
        return True
