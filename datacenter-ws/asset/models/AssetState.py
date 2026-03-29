from django.db import models
from django.utils.translation import gettext_lazy as _


class AssetStateCode(models.TextChoices):
    IN_STOCK = 'in_stock', _('In Stock')
    IN_PREPARATION = 'in_preparation', _('In Preparation')
    IN_MAINTENANCE = 'in_maintenance', _('In Maintenance')
    IN_PRODUCTION = 'in_production', _('In Production')
    DECOMMISSIONED = 'decommissioned', _('Decommissioned')


# Allowed transitions between standard states.
# If from_state or to_state has code=None (custom state), no validation is applied.
# The 'decommissioned' state is terminal: no outgoing transitions are allowed.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    AssetStateCode.IN_STOCK: {
        AssetStateCode.IN_PREPARATION,
        AssetStateCode.IN_PRODUCTION,
        AssetStateCode.DECOMMISSIONED,
    },
    AssetStateCode.IN_PREPARATION: {
        AssetStateCode.IN_STOCK,
        AssetStateCode.IN_PRODUCTION,
        AssetStateCode.DECOMMISSIONED,
    },
    AssetStateCode.IN_PRODUCTION: {
        AssetStateCode.IN_MAINTENANCE,
        AssetStateCode.IN_STOCK,
        AssetStateCode.DECOMMISSIONED,
    },
    AssetStateCode.IN_MAINTENANCE: {
        AssetStateCode.IN_PRODUCTION,
        AssetStateCode.IN_STOCK,
        AssetStateCode.DECOMMISSIONED,
    },
    AssetStateCode.DECOMMISSIONED: set(),
}


class AssetState(models.Model):
    """
    Represents the state of an asset in the system.

    Attributes:
        name (str): The unique name of the asset state.
        description (str): A brief description of the asset state.
        code (str): Machine-readable code for standard system states (nullable for custom states).
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    code = models.CharField(
        max_length=30,
        choices=AssetStateCode.choices,
        unique=True,
        null=True,
        blank=True,
        default=None,
    )

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'asset_state'
