from rest_framework import serializers
from asset.models.AssetModelPort import AssetModelPort


class AssetModelPortSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetModelPort
        fields = [
            'id',
            'asset_model',
            'name',
            'port_type',
            'side',
            'pos_x',
            'pos_y',
            'notes',
        ]
