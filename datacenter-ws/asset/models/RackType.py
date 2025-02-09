from django.db import models


class RackType(models.Model):
    model = models.CharField(max_length=255, null=False)
    width = models.PositiveIntegerField(null=False)
    height = models.PositiveIntegerField(null=False)
    capacity = models.PositiveIntegerField(default=48)

    def __str__(self):
        return f"{self.model} ({self.width}x{self.height})"

    class Meta:
        db_table = 'rack_type'
        verbose_name = 'Rack Type'
        verbose_name_plural = 'Rack Types'
