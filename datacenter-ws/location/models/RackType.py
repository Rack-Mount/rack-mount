from django.db import models
from django.utils.translation import gettext_lazy as _


class RackType(models.Model):
    """
    RackType model represents the type of rack used in a data center.

    Attributes:
        model (CharField): The model name of the rack.
        width (PositiveIntegerField): The width of the rack.
        height (PositiveIntegerField): The height of the rack.
        depth (PositiveIntegerField): The depth of the rack.
        capacity (PositiveIntegerField): The capacity of the rack, default is 48.
        created_at (DateTimeField): The date and time when the rack type was created.
        updated_at (DateTimeField): The date and time when the rack type was last updated.

    Methods:
        __str__(): Returns a string representation of the rack type in the format "model (widthxdepth)".

    Meta:
        db_table (str): The name of the database table.
        verbose_name (str): The human-readable name of the model.
        verbose_name_plural (str): The human-readable plural name of the model.
    """
    model = models.CharField(max_length=255, null=False)
    width = models.PositiveIntegerField(null=False)
    height = models.PositiveIntegerField(
        null=True, blank=True, help_text=_('Height in cm'))
    depth = models.PositiveIntegerField(null=False)
    capacity = models.PositiveIntegerField(null=False, default=48)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.model} ({self.width}x{self.depth})"

    class Meta:
        db_table = 'rack_type'
        verbose_name = _('Rack Type')
        verbose_name_plural = _('Rack Types')
