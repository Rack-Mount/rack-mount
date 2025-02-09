from django.contrib import admin
from asset.models import Asset, AssetState, Rack
from asset.admin import AssetCustomFieldInline
from datacenter.models import Location
from reversion.admin import VersionAdmin
from import_export.admin import ExportActionModelAdmin
from import_export import resources


class AssetResource(resources.ModelResource):

    class Meta:
        model = Asset
        fields = ('hostname', 'rack__location__name', 'rack__name', 'model__type__name', 'model__name', 'model__vendor__name',
                  'serial_number', 'sap_id', 'order_id', 'model__rack_units', 'power_cosumption_watt')
        name = "Export/Import assets"


@admin.register(Asset)
class AssetAdmin(ExportActionModelAdmin, VersionAdmin):
    save_on_top = True
    save_as = True

    resource_classes = [AssetResource]

    list_display = ('hostname', 'rack__location', 'rack__name', 'model__type', 'model__name', 'model__vendor',
                    'serial_number', 'sap_id', 'order_id', 'model__rack_units', 'power_cosumption_watt', 'state')
    search_fields = ('hostname', 'model__type__name',
                     'model__name', 'serial_number', 'sap_id', 'order_id')
    list_filter = ('model__type__name', 'model__vendor',
                   'rack__location', 'state')
    ordering = ('hostname',)
    readonly_fields = ['front_image_preview',
                       'rear_image_preview', 'created_at', 'updated_at']

    inlines = [AssetCustomFieldInline]
    autocomplete_fields = ['model', 'rack']

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return True

    def get_form(self, request, obj=None, **kwargs):
        form = super(AssetAdmin, self).get_form(request, obj, **kwargs)
        form.base_fields['state'].initial = AssetState.objects.get(name='New')

        return form
