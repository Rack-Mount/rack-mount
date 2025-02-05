from django.contrib import admin

from dc.models import LocationCustomField


class LocationCustomFieldInline(admin.TabularInline):
    model = LocationCustomField
    fields = ['field_name', 'field_value']
    extra = 0
    list_per_page = 12


@admin.register(LocationCustomField)
class LocationCustomFieldAdmin(admin.ModelAdmin):
    save_on_top = True
    fields = [
        ('field_name', 'field_value'),
    ]

    list_display = (
        'field_name',
        'field_value'
    )
    search_fields = ['datacenter__name', 'field_name']
