from django.db import models
from catalog.models.AssetModel import AssetModel


class NetworkSwitchAssetModel(AssetModel):
    ports = models.PositiveIntegerField(default=24, null=False)
    uplink_ports = models.PositiveIntegerField(default=2, null=False)

    def __str__(self):
        return super().__str__()

    class Meta:
        app_label = 'catalog'
        db_table = 'network_switch_asset_model'
