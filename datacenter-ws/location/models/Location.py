from django.db import models
import reversion


@reversion.register()
class Location(models.Model):
    """
    Location Model

    Represents a physical location within the datacenter.

    Attributes:
        name (str): The name of the location.
        short_name (str): A unique short name for the location.
        location (str): The physical address or description of the location.
        capacity (int): The capacity of the location, default is 0.
        operational_since (datetime): The date and time when the location became operational.
        manager (str): The name of the manager responsible for the location.
        manager_mail (str): The email address of the manager.

    Methods:
        __str__(): Returns the name of the location.

    Meta:
        ordering (list): Orders the locations by name.
        verbose_name (str): Human-readable name for the model.
        verbose_name_plural (str): Human-readable plural name for the model.
    """
    name = models.CharField(max_length=100, blank=False, null=False)
    short_name = models.CharField(
        max_length=15, blank=False, null=False, unique=True
    )
    location = models.CharField(max_length=100)
    capacity = models.PositiveIntegerField(default=0, null=False)
    operational_since = models.DateTimeField(auto_now_add=True, editable=True)
    manager = models.CharField(max_length=100, blank=True)
    manager_mail = models.EmailField(blank=True, null=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']
        verbose_name = 'Location'
        verbose_name_plural = 'Locations'
        db_table = 'datacenter_location'
