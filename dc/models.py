from django.db import models


class DataCenterLocation(models.Model):
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=100)
    capacity = models.IntegerField()
    operational_since = models.DateField()

    def __str__(self):
        return self.name
