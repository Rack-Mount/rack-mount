from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from django.utils.translation import gettext_lazy as _
from asset.models import RackUnit, Rack, Asset, GenericComponent


class RackUnitSerializer(serializers.ModelSerializer):
    """
    RackUnitSerializer for the RackUnit model.

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
    rack_id = serializers.IntegerField(
        source='rack.id',
        read_only=True
    )
    rack_name = serializers.StringRelatedField(
        source='rack.name',
        many=False,
        read_only=True
    )

    location_id = serializers.IntegerField(
        source='rack.room.location.id',
        read_only=True,
        default=None
    )

    location_name = serializers.StringRelatedField(
        source='rack.room.location.name',
        many=False,
        read_only=True,
        default=None
    )

    location_short_name = serializers.StringRelatedField(
        source='rack.room.location.short_name',
        many=False,
        read_only=True,
        default=None
    )

    device_id = serializers.IntegerField(
        source='device.id',
        read_only=True,
        default=None
    )

    device_hostname = serializers.StringRelatedField(
        source='device.hostname',
        many=False,
        read_only=True,
        default=None
    )

    device_model = serializers.StringRelatedField(
        source='device.model.name',
        many=False,
        read_only=True,
        default=None
    )

    device_rack_units = serializers.IntegerField(
        source='device.model.rack_units',
        read_only=True,
        default=None
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

    # ---- Generic Component (read) ----
    generic_component_id = serializers.IntegerField(
        source='generic_component.id',
        read_only=True,
        default=None
    )
    generic_component_name = serializers.CharField(
        source='generic_component.name',
        read_only=True,
        default=None
    )
    generic_component_type = serializers.CharField(
        source='generic_component.component_type',
        read_only=True,
        default=None
    )
    generic_component_type_display = serializers.CharField(
        source='generic_component.get_component_type_display',
        read_only=True,
        default=None
    )
    generic_component_rack_units = serializers.IntegerField(
        source='generic_component.rack_units',
        read_only=True,
        default=None
    )
    generic_component_front_image = serializers.StringRelatedField(
        source='generic_component.front_image',
        many=False,
        read_only=True,
        default=None
    )
    generic_component_rear_image = serializers.StringRelatedField(
        source='generic_component.rear_image',
        many=False,
        read_only=True,
        default=None
    )

    # ---- Generic Component (write) ----
    generic_component = serializers.PrimaryKeyRelatedField(
        queryset=GenericComponent.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    device_vendor = serializers.StringRelatedField(
        source='device.model.vendor.name',
        many=False,
        read_only=True,
        default=None
    )

    device_type = serializers.StringRelatedField(
        source='device.model.type.name',
        many=False,
        read_only=True,
        default=None
    )

    device_serial_number = serializers.CharField(
        source='device.serial_number',
        read_only=True,
        default=None
    )

    device_sap_id = serializers.CharField(
        source='device.sap_id',
        read_only=True,
        default=None
    )

    device_state = serializers.StringRelatedField(
        source='device.state.name',
        many=False,
        read_only=True,
        default=None
    )

    device_image = serializers.StringRelatedField(
        source='device.model.front_image',
        many=False,
        read_only=True,
        default=None
    )

    device_rear_image = serializers.StringRelatedField(
        source='device.model.rear_image',
        many=False,
        read_only=True,
        default=None
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

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)

        def get_val(key):
            if key in attrs:
                return attrs[key]
            if instance:
                return getattr(instance, key)
            return None

        device = get_val('device')
        generic_component = get_val('generic_component')
        rack = get_val('rack')

        if device is not None and generic_component is not None:
            raise serializers.ValidationError(
                _('A rack unit cannot have both a device and a generic component.')
            )

        if device and rack:
            asset_depth_mm = device.model.depth_mm
            rack_depth_cm = rack.model.depth
            rack_depth_mm = rack_depth_cm * 10 if rack_depth_cm is not None else None

            if asset_depth_mm and rack_depth_mm and asset_depth_mm > rack_depth_mm:
                raise serializers.ValidationError(
                    _("The device is too deep for this rack (Device: {}mm > Rack: {}mm).").format(
                        asset_depth_mm, rack_depth_mm)
                )

        return attrs

    class Meta:
        model = RackUnit
        fields = ['id', 'rack_id', 'rack_name', 'location_id', 'location_name', 'location_short_name', 'device_id', 'device_hostname',
                  'device_model', 'device_vendor', 'device_type', 'device_serial_number', 'device_sap_id', 'device_state',
                  'device_image', 'device_rear_image', 'device_power_watt', 'rack_installation_front', 'device_rack_units', 'position',
                  'rack', 'device',
                  'generic_component_id', 'generic_component_name', 'generic_component_type',
                  'generic_component_type_display', 'generic_component_rack_units',
                  'generic_component_front_image', 'generic_component_rear_image', 'generic_component']
