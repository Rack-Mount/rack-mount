from django.db import models
from datacenter.models import Location
from asset.models import AssetModel, AssetState
import reversion
from django.utils.html import mark_safe
from django.conf import settings


@reversion.register()
class Asset(models.Model):
    hostname = models.CharField(max_length=100, default='', null=False)
    model = models.ForeignKey(AssetModel, on_delete=models.CASCADE)
    serial_number = models.CharField(
        null=False, max_length=50, default='', unique=True)
    sap_id = models.CharField(blank=True, max_length=50, unique=True)
    order_id = models.CharField(blank=True, max_length=50)
    purchase_date = models.DateField(null=True, blank=True)
    # rack = models.OneToOneField(
    #     RackUnit, on_delete=models.CASCADE, null=True)
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
