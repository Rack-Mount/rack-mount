from rest_framework import serializers
from asset.models import AssetModel
from asset.serializers import VendorSerializer, AssetTypeSerializer


class AssetModelSerializer(serializers.ModelSerializer):
    vendor = VendorSerializer()
    type = AssetTypeSerializer()

    class Meta:
        model = AssetModel
        fields = '__all__'
