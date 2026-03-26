from rest_framework import serializers
from catalog.models import AssetModel, Vendor, AssetType
from catalog.serializers.VendorSerializer import VendorSerializer
from catalog.serializers.AssetTypeSerializer import AssetTypeSerializer
from catalog.serializers.AssetModelPortSerializer import AssetModelPortSerializer


class AssetModelSerializer(serializers.ModelSerializer):
    vendor = VendorSerializer(read_only=True)
    type = AssetTypeSerializer(read_only=True)
    vendor_id = serializers.PrimaryKeyRelatedField(
        queryset=Vendor.objects.all(),
        source='vendor',
        write_only=True,
    )
    type_id = serializers.PrimaryKeyRelatedField(
        queryset=AssetType.objects.all(),
        source='type',
        write_only=True,
    )
    front_image_transform = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=''
    )
    rear_image_transform = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=''
    )
    ports = AssetModelPortSerializer(source='network_ports', many=True, read_only=True)

    class Meta:
        model = AssetModel
        fields = [
            'id',
            'uuid',
            'name',
            'vendor',
            'vendor_id',
            'type',
            'type_id',
            'rack_units',
            'width_mm',
            'height_mm',
            'depth_mm',
            'weight_kg',
            'power_consumption_watt',
            'front_image',
            'front_image_transform',
            'rear_image',
            'rear_image_transform',
            'note',
            'ports',
        ]
        read_only_fields = ['uuid']
