from django.contrib import admin
from catalog.models import CustomFieldName


@admin.register(CustomFieldName)
class CustomFieldNameAdmin(admin.ModelAdmin):
    save_on_top = True

    list_display = ('name',)
    search_fields = ('name',)
    list_filter = ('name',)
    ordering = ('name',)

    def has_delete_permission(self, request, obj=None):
        return False
