from django.contrib import admin

from location.models import LocationCustomField


class LocationCustomFieldInline(admin.TabularInline):
    model = LocationCustomField
    fields = ['field_name', 'field_value']
    autocomplete_fields = ['field_name']
    extra = 0
    list_per_page = 12


@admin.register(LocationCustomField)
class LocationCustomFieldAdmin(admin.ModelAdmin):
    save_on_top = True
    autocomplete_fields = ['field_name']
    fields = [
        ('field_name', 'field_value'),
    ]

    list_display = (
        'field_name',
        'field_value'
    )
    search_fields = ['location__name', 'field_name__name']
