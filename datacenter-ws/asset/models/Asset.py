from django.db import models
from datacenter.models import Location
from asset.models import AssetModel, AssetState
import reversion
from django.utils.html import mark_safe
from django.conf import settings


@reversion.register()
class Asset(models.Model):
    """
    Asset model representing a physical or virtual asset in the datacenter.

    Attributes:
        hostname (CharField): The hostname of the asset.
        model (ForeignKey): Foreign key to the AssetModel.
        serial_number (CharField): The unique serial number of the asset.
        sap_id (CharField): The unique SAP ID of the asset.
        order_id (CharField): The order ID associated with the asset.
        purchase_date (DateField): The purchase date of the asset.
        state (ForeignKey): Foreign key to the AssetState.
        decommissioned_date (DateField): The date the asset was decommissioned.
        warranty_expiration (DateField): The warranty expiration date of the asset.
        support_expiration (DateField): The support expiration date of the asset.
        power_supplies (PositiveIntegerField): The number of power supplies in the asset.
        power_cosumption_watt (PositiveIntegerField): The power consumption of the asset in watts.
        note (TextField): Additional notes about the asset.
        created_at (DateTimeField): The date and time when the asset was created.
        updated_at (DateTimeField): The date and time when the asset was last updated.

    Methods:
        front_image_preview(): Returns an HTML image tag for the front image of the asset model.
        rear_image_preview(): Returns an HTML image tag for the rear image of the asset model.
        __str__(): Returns a string representation of the asset.

    Meta:
        ordering: Orders the assets by hostname.
        verbose_name: The singular name for the asset.
        verbose_name_plural: The plural name for the assets.
        db_table: The database table name for the asset.
    """
    hostname = models.CharField(max_length=100, default='', null=False)
    model = models.ForeignKey(AssetModel, on_delete=models.CASCADE)
    serial_number = models.CharField(
        null=False, max_length=50, default='', unique=True)
    sap_id = models.CharField(blank=True, max_length=50, unique=True)
    order_id = models.CharField(blank=True, max_length=50)
    purchase_date = models.DateField(null=True, blank=True)
    state = models.ForeignKey(
        AssetState, on_delete=models.CASCADE, related_name='assets')
    decommissioned_date = models.DateField(null=True, blank=True)
    warranty_expiration = models.DateField(null=True, blank=True)
    support_expiration = models.DateField(null=True, blank=True)
    power_supplies = models.PositiveIntegerField(default=2, null=False)
    power_cosumption_watt = models.PositiveIntegerField(default=0, null=False)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def front_image_preview(self):
        return mark_safe('<img src="/%s/%s" width="300" />' % (settings.MEDIA_ROOT, self.model.front_image)) if self.model.front_image else ''

    def rear_image_preview(self):
        return mark_safe('<img src="/%s/%s" width="300" />' % (settings.MEDIA_ROOT, self.model.rear_image)) if self.model.rear_image else ''

    def __str__(self):
        return f"{self.hostname} ({self.serial_number}) - {self.model.vendor} - {self.model.name}"

    class Meta:
        ordering = ['hostname']
        verbose_name = 'Asset'
        verbose_name_plural = 'Assets'
        db_table = 'asset'
