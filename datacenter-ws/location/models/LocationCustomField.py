from django.db import models
from location.models import Location


class LocationCustomField(models.Model):
    """
    LocationCustomField model represents custom fields associated with a specific location.

    Attributes:
        location (ForeignKey): A foreign key to the Location model, representing the location to which this custom field belongs.
        field_name (CharField): The name of the custom field. This field is required and has a maximum length of 100 characters.
        field_value (CharField): The value of the custom field. This field is optional and has a maximum length of 255 characters.

    Methods:
        __str__(): Returns a string representation of the custom field in the format "field_name: field_value".

    Meta:
        db_table (str): The name of the database table used for this model ('location_custom_field').
    """
    location = models.ForeignKey(
        Location, related_name='custom_fields', on_delete=models.CASCADE)
    field_name = models.CharField(max_length=100, blank=False, null=False)
    field_value = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.field_name}: {self.field_value}"

    class Meta:
        db_table = 'location_custom_field'
