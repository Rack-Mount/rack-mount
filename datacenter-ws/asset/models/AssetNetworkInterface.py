from django.db import models
from django.utils.translation import gettext_lazy as _


class AssetNetworkInterface(models.Model):
    """
    A network interface card (NIC) installed in a specific asset (typically a server).
    Unlike AssetModelPort, this is asset-level so each asset can have a custom
    set of NICs regardless of the model definition.
    """

    MEDIA_TYPE_CHOICES = [
        ('copper', _('Copper (RJ45 / 10GBASE-T)')),
        ('fiber', _('Fiber (SFP / DAC)')),
    ]

    PORT_COUNT_CHOICES = [
        (1, _('Single port (1×)')),
        (2, _('Dual port (2×)')),
        (4, _('Quad port (4×)')),
    ]

    SPEED_CHOICES = [
        ('100M', '100 Mbps'),
        ('1G',   '1 GbE'),
        ('10G',  '10 GbE'),
        ('25G',  '25 GbE'),
        ('40G',  '40 GbE'),
        ('100G', '100 GbE'),
        ('200G', '200 GbE'),
        ('400G', '400 GbE'),
    ]

    asset = models.ForeignKey(
        'asset.Asset',
        on_delete=models.CASCADE,
        related_name='network_interfaces',
        verbose_name=_('Asset'),
    )
    name = models.CharField(
        max_length=64,
        verbose_name=_('Name'),
        help_text=_('Descriptive name, e.g. "NIC 1", "eth0", "ens3f0"'),
    )
    media_type = models.CharField(
        max_length=10,
        choices=MEDIA_TYPE_CHOICES,
        default='copper',
        verbose_name=_('Media type'),
    )
    port_count = models.PositiveSmallIntegerField(
        choices=PORT_COUNT_CHOICES,
        default=1,
        verbose_name=_('Port count'),
    )
    speed = models.CharField(
        max_length=8,
        choices=SPEED_CHOICES,
        default='1G',
        verbose_name=_('Speed'),
    )
    slot = models.CharField(
        max_length=32,
        blank=True,
        default='',
        verbose_name=_('Slot'),
        help_text=_('Physical slot identifier, e.g. "PCIe 3", "Mezz 1"'),
    )
    notes = models.TextField(
        blank=True,
        default='',
        verbose_name=_('Notes'),
    )

    SIDE_CHOICES = [
        ('front', _('Front')),
        ('rear',  _('Rear')),
    ]

    side = models.CharField(
        max_length=5,
        choices=SIDE_CHOICES,
        default='rear',
        blank=True,
        verbose_name=_('Side'),
        help_text=_('Panel side where the NIC is visible (front or rear)'),
    )
    pos_x = models.FloatField(
        null=True,
        blank=True,
        verbose_name=_('Position X'),
        help_text=_('Top-left X position as percentage 0–100'),
    )
    pos_y = models.FloatField(
        null=True,
        blank=True,
        verbose_name=_('Position Y'),
        help_text=_('Top-left Y position as percentage 0–100'),
    )
    width = models.FloatField(
        null=True,
        blank=True,
        verbose_name=_('Width'),
        help_text=_('Rectangle width as percentage 0–100'),
    )
    height = models.FloatField(
        null=True,
        blank=True,
        verbose_name=_('Height'),
        help_text=_('Rectangle height as percentage 0–100'),
    )

    class Meta:
        app_label = 'asset'
        db_table = 'asset_network_interface'
        ordering = ['name']
        verbose_name = _('Network interface')
        verbose_name_plural = _('Network interfaces')

    def __str__(self):
        return (
            f"{self.asset} — {self.name} "
            f"({self.port_count}× {self.speed} {self.get_media_type_display()})"
        )
