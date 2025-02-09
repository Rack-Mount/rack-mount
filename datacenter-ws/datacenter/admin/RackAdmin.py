from django.contrib import admin
from datacenter.models import Rack


@admin.register(Rack)
class RackAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'capacity')
    search_fields = ('name', 'location__name')
    list_filter = ('location',)

    save_on_top = True
    ordering = ('name',)
    save_as = True
