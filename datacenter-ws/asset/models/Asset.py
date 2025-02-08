from django.db import models
from datacenter.models import Location
from asset.models import AssetModel, AssetState
import reversion


@reversion.register()
class Asset(models.Model):
    hostname = models.CharField(max_length=100, default='', null=False)
    model = models.ForeignKey(AssetModel, on_delete=models.CASCADE)
    serial_number = models.CharField(
        null=False, max_length=50, default='', unique=True)
    sap_id = models.CharField(blank=True, max_length=50, unique=True)
    order_id = models.CharField(blank=True, max_length=50)
    purchase_date = models.DateField(null=True, blank=True)
    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name='assets')
    state = models.ForeignKey(
        AssetState, on_delete=models.CASCADE, related_name='assets', default=(AssetState.objects.get(name='New')))
    decommissioned_date = models.DateField(null=True, blank=True)
    warranty_expiration = models.DateField(null=True, blank=True)
    support_expiration = models.DateField(null=True, blank=True)
    power_supplies = models.PositiveIntegerField(default=2, null=False)
    power_cosumption_watt = models.PositiveIntegerField(default=0, null=False)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.hostname} - {self.model.vendor} - {self.model.name}"

    class Meta:
        ordering = ['hostname']
        verbose_name = 'Asset'
        verbose_name_plural = 'Assets'
