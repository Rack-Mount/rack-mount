from rest_framework import serializers
from asset.models import Asset
from asset.serializers import AssetModelSerializer, AssetStateSerializer


class AssetSerializer(serializers.HyperlinkedModelSerializer):
    id = serializers.ReadOnlyField()
    model = AssetModelSerializer()
    state = AssetStateSerializer()

    class Meta:
        model = Asset
        fields = '__all__'
