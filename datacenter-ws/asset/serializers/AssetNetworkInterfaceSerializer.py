from rest_framework import serializers
from asset.models.AssetNetworkInterface import AssetNetworkInterface


class AssetNetworkInterfaceSerializer(serializers.ModelSerializer):
    media_type_display = serializers.CharField(
        source='get_media_type_display', read_only=True)
    port_count_display = serializers.CharField(
        source='get_port_count_display', read_only=True)
    speed_display = serializers.CharField(
        source='get_speed_display', read_only=True)

    class Meta:
        model = AssetNetworkInterface
        fields = [
            'id',
            'asset',
            'name',
            'media_type',
            'media_type_display',
            'port_count',
            'port_count_display',
            'speed',
            'speed_display',
            'slot',
            'notes',
            'side',
            'pos_x',
            'pos_y',
            'width',
            'height',
        ]
