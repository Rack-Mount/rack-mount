from django.contrib import admin
from datacenter.models import RackType


@admin.register(RackType)
class RackTypeAdmin(admin.ModelAdmin):
    list_display = ('model', 'width', 'height', 'capacity')
    list_filter = ('model',)

    save_on_top = True
    ordering = ('model', )
    save_as = True
