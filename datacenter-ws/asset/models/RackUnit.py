from django.conf import settings
from django.db import models
from asset.models import Asset, Rack
import reversion
from django.utils.html import mark_safe


@reversion.register()
class RackUnit(models.Model):
    """
    RackUnit model represents a unit within a rack in a data center.

    Attributes:
        rack (ForeignKey): Foreign key to the Rack model, representing the rack this unit belongs to.
        unit (PositiveIntegerField): The unit number within the rack.
        front (BooleanField): Indicates whether the unit is at the front (default is True).
        device (OneToOneField): One-to-one relationship with the Asset model, representing the device installed in this unit.
        description (TextField): Optional description of the rack unit.
        created_at (DateTimeField): Timestamp when the rack unit was created.
        updated_at (DateTimeField): Timestamp when the rack unit was last updated.

    Methods:
        __str__(): Returns a string representation of the rack unit, including rack name, unit number, and position (front/rear).
        image_preview(): Returns an HTML image tag for the device's front image if available.

    Meta:
        unique_together: Ensures that the combination of rack, unit, and front is unique.
        ordering: Orders the rack units by rack and unit in descending order.
        db_table: Specifies the database table name as 'rack_unit'.
    """
    rack = models.ForeignKey(Rack, on_delete=models.CASCADE)
    position = models.PositiveIntegerField()
    front = models.BooleanField(default=True)
    device = models.OneToOneField(
        Asset, on_delete=models.CASCADE, null=True, blank=True
    )
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        position = "front" if self.front else "rear"
        return f"{self.rack.name} - {self.position} ({position})"

    def image_preview(self):
        return mark_safe('<img src="%s%s" width="300" />' % (settings.MEDIA_URL, self.device.model.front_image)) if self.device and self.device.model.front_image else ''

    class Meta:
        unique_together = ('rack', 'position', 'front')
        ordering = ['rack', '-position']
        db_table = 'rack_unit'
