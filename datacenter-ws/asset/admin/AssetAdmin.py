from django.contrib import admin
from asset.models import Asset, AssetState, RackUnit
from asset.admin import AssetCustomFieldInline
from reversion.admin import VersionAdmin
from import_export.admin import ExportActionModelAdmin
from import_export import resources


class AssetResource(resources.ModelResource):

    class Meta:
        model = Asset
        fields = ('hostname',  'model__type__name', 'model__name', 'model__vendor__name',
                  'serial_number', 'sap_id', 'order_id', 'model__rack_units', 'power_cosumption_watt')
        name = "Export/Import assets"


class RackUnitInline(admin.TabularInline):
    model = RackUnit
    fields = ['rack', 'unit', 'front', 'device']
    readonly_fields = ['image_preview']
    autocomplete_fields = ['rack']
    can_delete = False
    show_change_link = False
    extra = 0


@admin.register(Asset)
class AssetAdmin(ExportActionModelAdmin, VersionAdmin):
    save_on_top = True
    save_as = True

    resource_classes = [AssetResource]

    list_display = ('hostname',  'model__type', 'model__name', 'model__vendor',
                    'serial_number', 'sap_id', 'order_id', 'model__rack_units', 'power_cosumption_watt', 'state')
    search_fields = ('hostname', 'model__type__name',
                     'model__name', 'serial_number', 'sap_id', 'order_id')
    list_filter = ('model__type__name', 'model__vendor',
                   'state')
    ordering = ('hostname',)
    readonly_fields = ['front_image_preview',
                       'rear_image_preview', 'created_at', 'updated_at']

    inlines = [RackUnitInline, AssetCustomFieldInline]
    autocomplete_fields = ['model']

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return True

    def get_form(self, request, obj=None, **kwargs):
        form = super(AssetAdmin, self).get_form(request, obj, **kwargs)
        form.base_fields['state'].initial = AssetState.objects.get(name='New')

        return form
