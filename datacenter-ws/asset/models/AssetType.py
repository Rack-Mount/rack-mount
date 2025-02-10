from django.db import models


class AssetType(models.Model):
    """
    AssetType model represents different types of assets in the system.

    Attributes:
        name (str): The name of the asset type. Must be unique and have a maximum length of 100 characters.
        description (str): A brief description of the asset type. This field is optional and defaults to an empty string.

    Methods:
        __str__(): Returns the name of the asset type as its string representation.

    Meta:
        db_table (str): The name of the database table to use for this model ('asset_type').
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default='')

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'asset_type'
