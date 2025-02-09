from django.contrib import admin
from asset.models import Rack


@admin.register(Rack)
class RackAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'model')
    search_fields = ('name', 'location__name')
    list_filter = ('location', 'model')

    save_on_top = True
    ordering = ('location', 'name',)
    save_as = True
