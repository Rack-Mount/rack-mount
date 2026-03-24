from django.db import models


class WarehouseCategory(models.TextChoices):
    CABLE = 'cable', 'Cavo'
    FIBER = 'fiber', 'Fibra'
    SFP_SWITCH = 'sfp_switch', 'SFP Switch'
    SFP_SERVER = 'sfp_server', 'SFP Server'
    CABLE_MANAGER = 'cable_manager', 'Passacavi'
    OTHER = 'other', 'Altro'


class WarehouseUnit(models.TextChoices):
    PCS = 'pcs', 'pz'
    METERS = 'm', 'm'
    BOX = 'box', 'box'


class WarehouseItem(models.Model):
    name = models.CharField(max_length=200)
    category = models.CharField(
        max_length=20,
        choices=WarehouseCategory.choices,
        default=WarehouseCategory.OTHER,
    )
    specs = models.CharField(max_length=255, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit = models.CharField(
        max_length=10,
        choices=WarehouseUnit.choices,
        default=WarehouseUnit.PCS,
    )
    min_threshold = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    warehouse = models.ForeignKey(
        'Room',
        on_delete=models.CASCADE,
        related_name='warehouse_items',
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'warehouse_item'
        ordering = ['category', 'name']

    def __str__(self):
        return f'{self.name} ({self.get_category_display()}) — {self.warehouse.name}'

    @property
    def below_threshold(self) -> bool:
        if self.min_threshold is None:
            return False
        return self.quantity < self.min_threshold
