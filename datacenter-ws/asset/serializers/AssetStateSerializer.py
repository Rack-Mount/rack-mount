from rest_framework import serializers
from asset.models import AssetState


class AssetStateSerializer(serializers.ModelSerializer):

    class Meta:
        model = AssetState
        fields = ['name']
