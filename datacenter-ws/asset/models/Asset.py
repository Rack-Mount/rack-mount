from django.db import models
from datacenter.models import Location


class Asset(models.Model):
    hostname = models.CharField(max_length=100, default='', null=False)
    vendor = models.ForeignKey(
        'Vendor', on_delete=models.CASCADE, related_name='assets')
    model = models.CharField(max_length=100, default='', null=False)
    asset_type = models.ForeignKey(
        'AssetType', on_delete=models.CASCADE, related_name='assets')
    serial_number = models.CharField(null=False, max_length=50, default='')
    sap_id = models.CharField(blank=True, max_length=50)
    order_id = models.CharField(blank=True, max_length=50)
    purchase_date = models.DateField(null=True, blank=True)
    rack_units = models.PositiveIntegerField(default=1, null=False)
    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name='assets')
    state = models.ForeignKey(
        'AssetState', on_delete=models.CASCADE, related_name='assets')
    power_connections = models.PositiveIntegerField(default=1, null=False)
    power_cosumption_watt = models.PositiveIntegerField(default=0, null=False)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.hostname} - {self.vendor} - {self.model}"
