from django.contrib import admin
from asset.models import RackUnit


@admin.register(RackUnit)
class RackUnitAdmin(admin.ModelAdmin):
    list_display = ('rack', 'position', 'front', 'device')
    search_fields = ('rack', 'device')
    list_filter = ('rack__room', 'device__model')
    autocomplete_fields = ('rack', 'device')

    readonly_fields = ['image_preview']

    save_on_top = True
    save_as = True
