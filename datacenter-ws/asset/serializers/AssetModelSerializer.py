from rest_framework import serializers
from asset.models import AssetModel
from asset.serializers import VendorSerializer, AssetTypeSerializer


class AssetModelSerializer(serializers.ModelSerializer):
    """
    Serializer for the AssetModel model.
    vendor / type are nested objects for read; vendor_id / type_id are used for write.
    """
    vendor = VendorSerializer(read_only=True)
    type = AssetTypeSerializer(read_only=True)
    vendor_id = serializers.IntegerField(write_only=True)
    type_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = AssetModel
        fields = [
            'id',
            'name',
            'vendor',
            'vendor_id',
            'type',
            'type_id',
            'rack_units',
            'front_image',
            'rear_image',
            'note',
        ]
