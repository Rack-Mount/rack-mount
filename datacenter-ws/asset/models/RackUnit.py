from django.conf import settings
from django.db import models
from asset.models import Asset, Rack
import reversion
from django.utils.html import mark_safe


@reversion.register()
class RackUnit(models.Model):
    rack = models.ForeignKey(Rack, on_delete=models.CASCADE)
    unit = models.PositiveIntegerField()
    front = models.BooleanField(default=True)
    device = models.OneToOneField(
        Asset, on_delete=models.CASCADE, null=True, blank=True)
    description = models.TextField(blank=True)

    def __str__(self):
        position = "front" if self.front else "rear"
        return f"{self.rack.name} - {self.unit} ({position})"

    def image_preview(self):
        return mark_safe('<img src="/%s/%s" width="300" />' % (settings.MEDIA_ROOT, self.device.model.front_image)) if self.device.model.front_image else ''

    class Meta:
        unique_together = ('rack', 'unit', 'front')
        ordering = ['rack', '-unit']
        db_table = 'rack_unit'
