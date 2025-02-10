from rest_framework import serializers
from asset.models import Asset
from asset.serializers import AssetModelSerializer


class AssetSerializer(serializers.ModelSerializer):
    model = AssetModelSerializer()

    class Meta:
        model = Asset
        fields = '__all__'
