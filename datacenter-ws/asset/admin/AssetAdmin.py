from django.contrib import admin
from asset.models import Asset, AssetState
from asset.admin import AssetCustomFieldInline
from reversion.admin import VersionAdmin
from django import forms


@admin.register(Asset)
class AssetAdmin(VersionAdmin):
    save_on_top = True
    save_as = True

    list_display = ('hostname', 'model__type', 'model__name', 'model__vendor',
                    'serial_number', 'sap_id', 'model__rack_units', 'power_cosumption_watt', 'location', 'state', 'purchase_date')
    search_fields = ('hostname', 'model__type__name',
                     'model__name', 'serial_number', 'sap_id')
    list_filter = ('model__type__name', 'model__vendor',
                   'location__name', 'state')
    ordering = ('hostname',)
    readonly_fields = ['front_image_preview', 'rear_image_preview']

    inlines = [AssetCustomFieldInline]
    autocomplete_fields = ['model', 'location']

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return True

    def get_form(self, request, obj=None, **kwargs):
        form = super(AssetAdmin, self).get_form(request, obj, **kwargs)
        form.base_fields['state'].initial = AssetState.objects.get(name='New')
        return form
