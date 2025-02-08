from django.contrib import admin
from asset.models import Asset
from asset.admin import AssetCustomFieldInline
from asset.models import AssetModel
from reversion.admin import VersionAdmin


@admin.register(Asset)
class AssetAdmin(VersionAdmin):
    save_on_top = True
    list_display = ('hostname', 'model__type', 'model__name', 'model__vendor',
                    'model__rack_units', 'location', 'state', 'purchase_date')
    search_fields = ('hostname', 'model__type__name', 'model',)
    list_filter = ('model__type__name',)
    ordering = ('-purchase_date',)
    inlines = [AssetCustomFieldInline]
    autocomplete_fields = ['model', 'location']

    def has_delete_permission(self, request, obj=None):
        # Disable delete
        return False

    # def get_form(self, request, obj=None, **kwargs):
    #     form = super(AssetAdmin, self).get_form(request, obj, **kwargs)
    #     form.base_fields['model'].queryset = AssetModel.objects.filter(
    #         name__iexact='company')
    #     return form
