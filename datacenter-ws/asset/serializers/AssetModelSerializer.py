from rest_framework import serializers
from asset.models import AssetModel
from asset.models.Vendor import Vendor
from asset.models.AssetType import AssetType
from asset.models.AssetModelPort import AssetModelPort
from asset.serializers import VendorSerializer, AssetTypeSerializer
from asset.serializers.AssetModelPortSerializer import AssetModelPortSerializer


class AssetModelSerializer(serializers.ModelSerializer):
    """
    Serializer for the AssetModel model.
    vendor / type are nested objects for read; vendor_id / type_id are used for write.

    Image transform fields (write-only JSON strings):
      front_image_transform / rear_image_transform — processed server-side by
      asset.utils.image_processing.apply_transforms() before saving.
    """
    vendor = VendorSerializer(read_only=True)
    type = AssetTypeSerializer(read_only=True)
    # PrimaryKeyRelatedField validates that the ID actually exists in the DB,
    # returning a proper 400 instead of a 500 IntegrityError on invalid IDs.
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
    ports = AssetModelPortSerializer(
        source='network_ports', many=True, read_only=True)

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
            'front_image',
            'front_image_transform',
            'rear_image',
            'rear_image_transform',
            'note',
            'ports',
        ]
        read_only_fields = ['uuid']
