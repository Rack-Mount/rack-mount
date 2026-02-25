from django.db import models
import reversion

from location.models.Location import Location


@reversion.register()
class Room(models.Model):
    """
    Room Model

    Represents a physical room within a datacenter location.

    Attributes:
        location (Location): The location to which this room belongs.
        name (str): The name of the room.
        floor (int): The floor number where the room is located (optional).
        description (str): An optional description of the room.
        capacity (int): The capacity of the room (number of racks/units), default is 0.
        manager (str): The name of the manager responsible for the room.
        manager_mail (str): The email address of the manager.
        floor_plan (ImageField): An optional image of the room's floor plan (planimetria).
        floor_plan_data (JSONField): JSON representation of the interactive floor plan elements
                                     (walls, racks, doors) drawn in the Angular editor.
        created_at (datetime): The date and time when the record was created.
        updated_at (datetime): The date and time when the record was last updated.

    Methods:
        __str__(): Returns the name of the room.

    Meta:
        ordering (list): Orders the rooms by location and name.
        verbose_name (str): Human-readable name for the model.
        verbose_name_plural (str): Human-readable plural name for the model.
    """
    location = models.ForeignKey(
        Location,
        related_name='rooms',
        on_delete=models.CASCADE,
        null=False,
        blank=False,
    )
    name = models.CharField(max_length=100, blank=False, null=False)
    floor = models.IntegerField(null=True, blank=True)
    description = models.TextField(blank=True, null=True)
    capacity = models.PositiveIntegerField(default=0, null=False)
    manager = models.CharField(max_length=100, blank=True)
    manager_mail = models.EmailField(blank=True, null=True)
    floor_plan = models.ImageField(
        upload_to='rooms/floor_plans/',
        null=True,
        blank=True,
    )
    floor_plan_data = models.JSONField(
        null=True,
        blank=True,
        help_text='Interactive floor plan elements (walls, racks, doors) from the Angular editor.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.location} - {self.name}"

    class Meta:
        ordering = ['location', 'name']
        verbose_name = 'Room'
        verbose_name_plural = 'Rooms'
        db_table = 'datacenter_room'
