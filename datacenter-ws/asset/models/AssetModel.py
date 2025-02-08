from django.db import models
import reversion


@reversion.register()
class AssetModel(models.Model):
    name = models.CharField(max_length=100, default='', null=False)
    vendor = models.ForeignKey(
        'Vendor', on_delete=models.CASCADE, related_name='asset_vendor')
    type = models.ForeignKey(
        'AssetType', on_delete=models.CASCADE, related_name='asset_type')
    rack_units = models.PositiveIntegerField(default=1, null=False)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.vendor} - {self.name} - {self.type}"
