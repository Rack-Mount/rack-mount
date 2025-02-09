from django.db import models
import reversion
from asset.models import AssetType, Vendor
from django.utils.html import mark_safe
from django.conf import settings


@reversion.register()
class AssetModel(models.Model):
    name = models.CharField(max_length=100, default='', null=False)
    vendor = models.ForeignKey(
        Vendor, on_delete=models.CASCADE, related_name='asset_vendor')
    type = models.ForeignKey(
        AssetType, on_delete=models.CASCADE, related_name='asset_type')
    rack_units = models.PositiveIntegerField(default=1, null=False)
    front_image = models.ImageField(null=True)
    rear_image = models.ImageField(null=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def front_image_preview(self):
        return mark_safe('<img src="/%s/%s" width="300" />' % (settings.MEDIA_ROOT, self.front_image)) if self.front_image else ''

    def rear_image_preview(self):
        return mark_safe('<img src="/%s/%s" width="300" />' % (settings.MEDIA_ROOT, self.rear_image)) if self.rear_image else ''

    def __str__(self):
        return f"{self.vendor} - {self.name} - {self.type}"

    class Meta:
        unique_together = ('name', 'vendor', 'type')
        db_table = 'asset_model'
