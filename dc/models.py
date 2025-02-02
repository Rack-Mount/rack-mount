from django.db import models


class DataCenterLocation(models.Model):
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=100)
    capacity = models.IntegerField()
    operational_since = models.DateTimeField(auto_now_add=True, editable=True)

    def __str__(self):
        return self.name
