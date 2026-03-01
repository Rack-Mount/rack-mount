from rest_framework import serializers
from asset.models import AssetModel
from asset.serializers import VendorSerializer, AssetTypeSerializer


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
    vendor_id = serializers.IntegerField(write_only=True)
    type_id = serializers.IntegerField(write_only=True)
    front_image_transform = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=''
    )
    rear_image_transform = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=''
    )

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
            'front_image',
            'front_image_transform',
            'rear_image',
            'rear_image_transform',
            'note',
        ]
        read_only_fields = ['uuid']
