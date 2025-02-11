from rest_framework import serializers
from asset.models import RackUnit


class RackUnitSerializer(serializers.HyperlinkedModelSerializer):
    rack_id = serializers.StringRelatedField(
        source='rack.id',
        many=False,
        read_only=True
    )
    rack_name = serializers.StringRelatedField(
        source='rack.name',
        many=False,
        read_only=True
    )

    location_id = serializers.StringRelatedField(
        source='rack.location.id',
        many=False,
        read_only=True
    )

    location_name = serializers.StringRelatedField(
        source='rack.location.name',
        many=False,
        read_only=True
    )

    location_short_name = serializers.StringRelatedField(
        source='rack.location.short_name',
        many=False,
        read_only=True
    )

    device_id = serializers.StringRelatedField(
        source='device.id',
        many=False,
        read_only=True
    )

    device_hostname = serializers.StringRelatedField(
        source='device.hostname',
        many=False,
        read_only=True
    )

    device_model = serializers.StringRelatedField(
        source='device.model.name',
        many=False,
        read_only=True
    )

    device_vendor = serializers.StringRelatedField(
        source='device.model.vendor.name',
        many=False,
        read_only=True
    )

    device_type = serializers.StringRelatedField(
        source='device.model.type.name',
        many=False,
        read_only=True
    )

    rack_installation_front = serializers.BooleanField(
        source='front',
        read_only=True
    )

    class Meta:
        model = RackUnit
        fields = ['id', 'rack_id', 'rack_name', 'location_id', 'location_name', 'location_short_name', 'device_id', 'device_hostname',
                  'device_model', 'device_vendor', 'device_type', 'rack_installation_front']
