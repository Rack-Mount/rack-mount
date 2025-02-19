from django.db import models
from .AssetModel import AssetModel
from .AssetType import AssetType


class NetworkSwitchAssetModel(AssetModel):
    """
    NetworkSwitchAssetModel is a Django model representing a network switch asset.

    Attributes:
        ports (PositiveIntegerField): The number of ports on the network switch. Defaults to 24.
        uplink_ports (PositiveIntegerField): The number of uplink ports on the network switch. Defaults to 2.

    Methods:
        __str__(): Returns a string representation of the network switch asset model, including the asset model and management IP.

    Meta:
        db_table (str): The name of the database table used for this model ('network_switch_asset_model').
    """
    ports = models.PositiveIntegerField(default=24, null=False)
    uplink_ports = models.PositiveIntegerField(default=2, null=False)

    def __str__(self):
        return super().__str__()

    class Meta:
        db_table = 'network_switch_asset_model'
