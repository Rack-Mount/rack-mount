from django.db import models
from catalog.models.AssetModel import AssetModel


class AssetModelPort(models.Model):
    PORT_TYPE_CHOICES = [
        ('RJ45', 'RJ45 (1GbE)'),
        ('SFP', 'SFP (1G)'),
        ('SFP+', 'SFP+ (10G)'),
        ('SFP28', 'SFP28 (25G)'),
        ('QSFP+', 'QSFP+ (40G)'),
        ('QSFP28', 'QSFP28 (100G)'),
        ('QSFP-DD', 'QSFP-DD (400G)'),
        ('LC', 'LC Fiber'),
        ('SC', 'SC Fiber'),
        ('FC', 'Fibre Channel'),
        ('USB-A', 'USB-A'),
        ('USB-C', 'USB-C'),
        ('SERIAL', 'Serial Console'),
        ('MGMT', 'Management'),
        ('HDMI', 'HDMI'),
        ('VGA', 'VGA'),
        ('OTHER', 'Other'),
    ]

    SIDE_CHOICES = [
        ('front', 'Front'),
        ('rear', 'Rear'),
    ]

    asset_model = models.ForeignKey(
        AssetModel,
        on_delete=models.CASCADE,
        related_name='network_ports',
    )
    name = models.CharField(max_length=64)
    port_type = models.CharField(
        max_length=16,
        choices=PORT_TYPE_CHOICES,
        default='RJ45',
    )
    side = models.CharField(
        max_length=5,
        choices=SIDE_CHOICES,
        default='rear',
    )
    pos_x = models.FloatField(null=True, blank=True)
    pos_y = models.FloatField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        app_label = 'catalog'
        db_table = 'asset_model_port'
        ordering = ['side', 'name']

    def __str__(self):
        return f"{self.asset_model} — {self.name} ({self.port_type}, {self.side})"
