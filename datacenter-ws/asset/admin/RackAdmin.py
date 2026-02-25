from django.contrib import admin
from asset.models import Rack
from asset.models import RackUnit


class RackUnitInline(admin.TabularInline):
    model = RackUnit
    fields = ['rack', 'position', 'front', 'device', 'image_preview']
    readonly_fields = ['image_preview']
    autocomplete_fields = ['device']
    can_delete = False
    show_change_link = False
    extra = 0


@admin.register(Rack)
class RackAdmin(admin.ModelAdmin):
    list_display = ('name', 'room', 'model')
    search_fields = ('name', 'room__name')
    list_filter = ('room', 'model')

    inlines = [RackUnitInline]

    save_on_top = True
    ordering = ('room', 'name',)
    save_as = True
