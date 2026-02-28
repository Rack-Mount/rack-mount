from django.db import models
import reversion
from asset.models import AssetType, Vendor
from django.utils.html import mark_safe
from django.conf import settings


@reversion.register()
class AssetModel(models.Model):
    """
    AssetModel represents an asset in the data center.

    Attributes:
        name (str): The name of the asset.
        vendor (Vendor): The vendor associated with the asset.
        type (AssetType): The type of the asset.
        rack_units (int): The number of rack units the asset occupies.
        front_image (ImageField): The front image of the asset.
        rear_image (ImageField): The rear image of the asset.
        note (str): Additional notes about the asset.
        created_at (datetime): The timestamp when the asset was created.
        updated_at (datetime): The timestamp when the asset was last updated.

    Methods:
        front_image_preview(): Returns an HTML img tag for the front image preview.
        rear_image_preview(): Returns an HTML img tag for the rear image preview.
        __str__(): Returns a string representation of the asset.

    Meta:
        unique_together (tuple): Ensures that the combination of name, vendor, and type is unique.
        db_table (str): The name of the database table.
    """
    name = models.CharField(max_length=100, default='', null=False)
    vendor = models.ForeignKey(
        Vendor, on_delete=models.PROTECT, related_name='asset_vendor')
    type = models.ForeignKey(
        AssetType, on_delete=models.CASCADE, related_name='asset_type')
    rack_units = models.PositiveIntegerField(
        default=1, null=False, name='rack_units')
    front_image = models.ImageField(null=True)
    rear_image = models.ImageField(null=True)
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
        unique_together = ('name', 'vendor', 'type')
        db_table = 'asset_model'
