from django.db import models
from asset.models import Asset, Field


class AssetCustomField(models.Model):
    asset = models.ForeignKey(
        Asset, related_name='custom_fields', on_delete=models.CASCADE)
    field_name = models.ForeignKey(
        Field, related_name='field_name', on_delete=models.CASCADE)
    field_value = models.CharField(
        max_length=255, blank=True)

    def __str__(self):
        return f"{self.field_name}: {self.field_value}"

    class Meta:
        unique_together = ('asset', 'field_name')
