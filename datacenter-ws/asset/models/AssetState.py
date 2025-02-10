from django.db import models


class AssetState(models.Model):
    """
    Represents the state of an asset in the system.

    Attributes:
        name (str): The unique name of the asset state.
        description (str): A brief description of the asset state.

    Methods:
        __str__(): Returns the name of the asset state as its string representation.

    Meta:
        db_table (str): The name of the database table to use for this model ('asset_state').
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'asset_state'
