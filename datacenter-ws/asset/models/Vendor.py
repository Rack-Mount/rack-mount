from django.db import models


class Vendor(models.Model):
    """
    Vendor model representing a vendor entity.

    Attributes:
        name (str): The name of the vendor. Must be unique and have a maximum length of 255 characters.
        created_at (datetime): The date and time when the vendor was created. Automatically set on creation.
        updated_at (datetime): The date and time when the vendor was last updated. Automatically updated on save.

    Methods:
        __str__(): Returns the string representation of the vendor, which is the vendor's name.

    Meta:
        db_table (str): The name of the database table to use for this model ('vendor').
    """
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'vendor'
