from rest_framework import serializers
from asset.models import AssetModel
from asset.serializers import VendorSerializer, AssetTypeSerializer


class AssetModelSerializer(serializers.ModelSerializer):
    vendor = VendorSerializer()
    type = AssetTypeSerializer()

    class Meta:
        model = AssetModel
        fields = [
            'name',
            'vendor',
            'type',
            'rack_units',
            'front_image',
            'rear_image',
            'note'
        ]
