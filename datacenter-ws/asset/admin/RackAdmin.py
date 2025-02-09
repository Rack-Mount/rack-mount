from django.contrib import admin
from asset.models import Rack
from asset.models import RackUnit


class RackUnitInline(admin.TabularInline):
    model = RackUnit
    fields = ['rack', 'unit', 'front', 'device']
    # readonly_fields = ['rack', 'unit', 'front', 'device', 'image_preview']
    readonly_fields = ['image_preview']
    autocomplete_fields = ['device']
    can_delete = False
    show_change_link = False
    extra = 0


@admin.register(Rack)
class RackAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'model')
    search_fields = ('name', 'location__name')
    list_filter = ('location', 'model')

    inlines = [RackUnitInline]

    save_on_top = True
    ordering = ('location', 'name',)
    save_as = True
