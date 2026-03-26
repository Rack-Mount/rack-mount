import uuid as _uuid

from django.db import models
import reversion
from catalog.models.AssetType import AssetType
from catalog.models.Vendor import Vendor
from django.utils.html import mark_safe
from django.conf import settings
from asset.utils.upload_paths import asset_model_front_upload, asset_model_rear_upload


@reversion.register()
class AssetModel(models.Model):
    uuid = models.UUIDField(default=_uuid.uuid4, unique=True, editable=False)
    name = models.CharField(max_length=100, default='', null=False)
    vendor = models.ForeignKey(
        Vendor, on_delete=models.PROTECT, related_name='asset_vendor')
    type = models.ForeignKey(
        AssetType, on_delete=models.CASCADE, related_name='asset_type')
    rack_units = models.PositiveIntegerField(
        default=1, null=False, name='rack_units')
    width_mm = models.PositiveSmallIntegerField(null=True, blank=True)
    height_mm = models.PositiveSmallIntegerField(null=True, blank=True)
    depth_mm = models.PositiveSmallIntegerField(null=True, blank=True)
    weight_kg = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True)
    power_consumption_watt = models.PositiveIntegerField(default=0, null=False)
    front_image = models.ImageField(null=True, upload_to=asset_model_front_upload)
    rear_image = models.ImageField(null=True, upload_to=asset_model_rear_upload)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def front_image_preview(self):
        return mark_safe('<img src="%s%s" width="300" />' % (settings.MEDIA_URL, self.front_image)) if self.front_image else ''

    def rear_image_preview(self):
        return mark_safe('<img src="%s%s" width="300" />' % (settings.MEDIA_URL, self.rear_image)) if self.rear_image else ''

    def __str__(self):
        return f"{self.vendor} - {self.name} - {self.type}"

    class Meta:
        app_label = 'catalog'
        unique_together = ('name', 'vendor', 'type')
        db_table = 'asset_model'
