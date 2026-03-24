from django.db import models


class AssetStateCode(models.TextChoices):
    IN_STOCK = 'in_stock', 'In Stock'
    IN_PREPARAZIONE = 'in_preparazione', 'In Preparazione'
    IN_MANUTENZIONE = 'in_manutenzione', 'In Manutenzione'
    IN_PRODUZIONE = 'in_produzione', 'In Produzione'
    DISMESSO = 'dismesso', 'Dismesso'


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
