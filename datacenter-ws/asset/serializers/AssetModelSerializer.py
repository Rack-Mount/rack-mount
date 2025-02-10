from rest_framework import serializers
from asset.models import AssetModel
from asset.serializers import VendorSerializer


class AssetModelSerializer(serializers.ModelSerializer):
    vendor = VendorSerializer()

    class Meta:
        model = AssetModel
        fields = '__all__'
