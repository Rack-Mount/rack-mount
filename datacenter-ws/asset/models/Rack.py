from django.db import models
from datacenter.models.Location import Location
from asset.models import RackType
import reversion


@reversion.register()
class Rack(models.Model):
    name = models.CharField(max_length=100)
    model = models.ForeignKey(RackType, on_delete=models.CASCADE)
    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name='locations', null=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return f"{self.location.name} - {self.name}"

    class Meta:
        verbose_name = "Rack"
        verbose_name_plural = "Racks"
        ordering = ['name']
        unique_together = ('name', 'location')
