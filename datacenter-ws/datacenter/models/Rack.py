from django.db import models
from datacenter.models.Location import Location
import reversion


@reversion.register()
class Rack(models.Model):
    name = models.CharField(max_length=100)
    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name='racks', null=True)
    capacity = models.IntegerField()
    occupied_units = models.IntegerField(default=0)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Rack"
        verbose_name_plural = "Racks"
        ordering = ['name']
        unique_together = ('name', 'location')
