from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from asset.models import RackUnit, Rack, Asset


class RackUnitSerializer(serializers.HyperlinkedModelSerializer):
    """
    RackUnitSerializer is a HyperlinkedModelSerializer for the RackUnit model.

    Fields:
        - id: The unique identifier for the RackUnit.
        - rack_id: The ID of the associated rack.
        - rack_name: The name of the associated rack.
        - location_id: The ID of the location where the rack is situated.
        - location_name: The name of the location where the rack is situated.
        - location_short_name: The short name of the location where the rack is situated.
        - device_id: The ID of the associated device.
        - device_hostname: The hostname of the associated device.
        - device_model: The model name of the associated device.
        - device_vendor: The vendor name of the associated device model.
        - device_type: The type name of the associated device model.
        - rack_installation_front: Boolean indicating if the rack installation is at the front.
    """
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
        source='rack.room.location.id',
        many=False,
        read_only=True
    )

    location_name = serializers.StringRelatedField(
        source='rack.room.location.name',
        many=False,
        read_only=True
    )

    location_short_name = serializers.StringRelatedField(
        source='rack.room.location.short_name',
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

    device_rack_units = serializers.IntegerField(
        source='device.model.rack_units',
        read_only=True
    )

    # Write-only foreign-key fields used for creation / update
    rack = serializers.PrimaryKeyRelatedField(
        queryset=Rack.objects.all(),
        write_only=True
    )

    device = serializers.PrimaryKeyRelatedField(
        queryset=Asset.objects.all(),
        write_only=True,
        required=False,
        allow_null=True
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

    device_serial_number = serializers.CharField(
        source='device.serial_number',
        read_only=True
    )

    device_sap_id = serializers.CharField(
        source='device.sap_id',
        read_only=True
    )

    device_state = serializers.StringRelatedField(
        source='device.state.name',
        many=False,
        read_only=True
    )

    device_image = serializers.StringRelatedField(
        source='device.model.front_image',
        many=False,
        read_only=True
    )

    device_rear_image = serializers.StringRelatedField(
        source='device.model.rear_image',
        many=False,
        read_only=True
    )

    device_power_watt = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.INT32)
    def get_device_power_watt(self, obj):
        if obj.device is None:
            return 0
        return (obj.device.power_cosumption_watt or 0) * (obj.device.power_supplies or 1)

    rack_installation_front = serializers.BooleanField(
        source='front',
        read_only=True
    )

    class Meta:
        model = RackUnit
        fields = ['id', 'rack_id', 'rack_name', 'location_id', 'location_name', 'location_short_name', 'device_id', 'device_hostname',
                  'device_model', 'device_vendor', 'device_type', 'device_serial_number', 'device_sap_id', 'device_state',
                  'device_image', 'device_rear_image', 'device_power_watt', 'rack_installation_front', 'device_rack_units', 'position',
                  'rack', 'device']
