import uuid as _uuid
import reversion
from django.db import models
from django.conf import settings
from django.utils.html import mark_safe
from asset.utils.upload_paths import generic_component_front_upload, generic_component_rear_upload


@reversion.register()
class GenericComponent(models.Model):
    """
    GenericComponent represents a generic/consumable rack-mounted component that
    does not require full asset specifications (e.g. cable managers, patch panels,
    blanking panels, PDUs, etc.).

    Unlike Asset, these components:
    - Have no hostname, serial number, SAP ID, or vendor model reference.
    - Are considered consumable items.
    - Can still occupy rack units.

    Attributes:
        name (CharField): Name/label of the component (e.g. "1U Cable Manager").
        component_type (CharField): Category of the component.
        rack_units (PositiveIntegerField): Number of rack units occupied.
        note (TextField): Optional notes.
        created_at (DateTimeField): Creation timestamp.
        updated_at (DateTimeField): Last update timestamp.
    """

    COMPONENT_TYPE_CHOICES = [
        ('cable_manager', 'Passacavi / Cable Manager'),
        ('blanking_panel', 'Pannello cieco / Blanking Panel'),
        ('patch_panel', 'Patch Panel'),
        ('pdu', 'PDU / Power Strip'),
        ('shelf', 'Ripiano / Shelf'),
        ('other', 'Altro / Other'),
    ]

    name = models.CharField(max_length=200)
    uuid = models.UUIDField(default=_uuid.uuid4, unique=True, editable=False)
    component_type = models.CharField(
        max_length=50,
        choices=COMPONENT_TYPE_CHOICES,
        default='other',
    )
    rack_units = models.PositiveIntegerField(
        default=1,
        help_text='Number of rack units (U) occupied by this component.',
    )
    front_image = models.ImageField(
        null=True, blank=True, upload_to=generic_component_front_upload,
        help_text='Front-face image of the component.'
    )
    rear_image = models.ImageField(
        null=True, blank=True, upload_to=generic_component_rear_upload,
        help_text='Rear-face image of the component.'
    )
    warehouse_item = models.ForeignKey(
        'location.WarehouseItem',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='component_definitions',
        help_text='Articolo di magazzino da cui attingere quando il componente viene installato in rack.',
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def front_image_preview(self):
        return mark_safe('<img src="%s%s" width="300" />' % (settings.MEDIA_URL, self.front_image)) if self.front_image else ''

    def rear_image_preview(self):
        return mark_safe('<img src="%s%s" width="300" />' % (settings.MEDIA_URL, self.rear_image)) if self.rear_image else ''

    def __str__(self):
        return f'{self.name} ({self.get_component_type_display()}) – {self.rack_units}U'

    class Meta:
        verbose_name = 'Generic Component'
        verbose_name_plural = 'Generic Components'
        ordering = ['component_type', 'name']
        db_table = 'generic_component'
