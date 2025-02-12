from django.db import models
from datacenter.models.Location import Location
from asset.models import RackType
import reversion


@reversion.register()
class Rack(models.Model):
    """
    Rack model representing a rack in a data center.

    Attributes:
        name (str): The name of the rack.
        model (ForeignKey): A foreign key to the RackType model.
        location (ForeignKey): A foreign key to the Location model, can be null.
        description (str): A text field for additional description of the rack.
        created_at (datetime): The date and time when the rack was created.
        updated_at (datetime): The date and time when the rack was last updated.

    Methods:
        __str__(): Returns a string representation of the rack, combining location name and rack name.

    Meta:
        verbose_name (str): The singular name for the model.
        verbose_name_plural (str): The plural name for the model.
        ordering (list): Default ordering for the model, by name.
        unique_together (tuple): Ensures that the combination of name and location is unique.
        db_table (str): The name of the database table to use for the model.
    """
    name = models.CharField(max_length=100)
    model = models.ForeignKey(RackType, on_delete=models.CASCADE, null=False)
    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name='locations', null=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.location.name} - {self.name}"

    class Meta:
        verbose_name = "Rack"
        verbose_name_plural = "Racks"
        ordering = ['name']
        unique_together = ('name', 'location')
        db_table = 'rack'
