from django.contrib import admin
from .models import DataCenterLocation


@admin.register(DataCenterLocation)
class DataCenterLocationAdmin(admin.ModelAdmin):
    save_on_top = True
    fields = [
        ('name', 'location'),
        ('capacity', 'operational_since'),
    ]

    list_display = ('name', 'location', 'capacity',
                    'operational_since')
    search_fields = ['name', 'location']
    readonly_fields = ['operational_since']
