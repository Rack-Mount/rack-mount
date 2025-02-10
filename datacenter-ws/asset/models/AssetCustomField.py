from django.db import models
from asset.models import Asset, CustomFieldName


class AssetCustomField(models.Model):
    """
    AssetCustomField model represents a custom field associated with an asset.

    Attributes:
        asset (ForeignKey): A reference to the Asset model, indicating the asset to which this custom field belongs.
        field_name (ForeignKey): A reference to the CustomFieldName model, indicating the name of the custom field.
        field_value (CharField): The value of the custom field, stored as a string with a maximum length of 255 characters.

    Methods:
        __str__(): Returns a string representation of the custom field in the format "field_name: field_value".

    Meta:
        unique_together (tuple): Ensures that each combination of asset and field_name is unique.
        db_table (str): The name of the database table used to store AssetCustomField records.
    """
    asset = models.ForeignKey(
        Asset, related_name='custom_fields', on_delete=models.CASCADE)
    field_name = models.ForeignKey(
        CustomFieldName, related_name='field_name', on_delete=models.CASCADE)
    field_value = models.CharField(
        max_length=255, blank=True)

    def __str__(self):
        return f"{self.field_name}: {self.field_value}"

    class Meta:
        unique_together = ('asset', 'field_name')
        db_table = 'asset_custom_field'
