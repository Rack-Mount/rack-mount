from django.db import models
from dc.models import Location


class LocationCustomField(models.Model):
    location = models.ForeignKey(
        Location, related_name='custom_fields', on_delete=models.CASCADE)
    field_name = models.CharField(max_length=100, blank=False, null=False)
    field_value = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.field_name}: {self.field_value}"
