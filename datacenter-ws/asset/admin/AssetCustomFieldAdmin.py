from django.contrib import admin

from asset.models import AssetCustomField


class AssetCustomFieldInline(admin.TabularInline):
    model = AssetCustomField
    fields = ['field_name', 'field_value']
    extra = 1
    list_per_page = 12


@admin.register(AssetCustomField)
class AssetCustomFieldAdmin(admin.ModelAdmin):
    save_on_top = True
    fields = [
        ('field_name', 'field_value'),
    ]

    list_display = (
        'field_name',
        'field_value'
    )
    search_fields = ['asset__name', 'field_name']
