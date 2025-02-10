from django.db import models


class CustomFieldName(models.Model):
    """
    CustomFieldName model represents a custom field name in the database.

    Attributes:
        name (str): The name of the custom field. It is a unique string with a maximum length of 255 characters.

    Methods:
        __str__(): Returns the string representation of the custom field name.

    Meta:
        db_table (str): The name of the database table used by this model ('custom_field_name').
    """
    name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'custom_field_name'
