from django.db import models


class DataCenterLocation(models.Model):
    name = models.CharField(max_length=100, blank=False, null=False)
    short_name = models.CharField(
        max_length=15, blank=False, null=False, unique=True
    )
    location = models.CharField(max_length=100)
    capacity = models.IntegerField()
    operational_since = models.DateTimeField(auto_now_add=True, editable=True)
    manager = models.CharField(max_length=100, blank=True)
    manager_mail = models.EmailField(blank=True, null=True)

    def __str__(self):
        return self.name
