from rest_framework import serializers
from asset.models import GenericComponent
from location.models import WarehouseItem


class GenericComponentSerializer(serializers.ModelSerializer):
    """
    Serializer for GenericComponent model.

    Exposes all fields of a generic/consumable rack-mounted component.
    Image transform fields (write-only JSON strings):
      front_image_transform / rear_image_transform — processed server-side
      by asset.utils.image_processing.apply_transforms() before saving.
    """

    component_type_display = serializers.CharField(
        source='get_component_type_display',
        read_only=True,
    )

    front_image_transform = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=''
    )
    rear_image_transform = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=''
    )

    warehouse_item = serializers.PrimaryKeyRelatedField(
        queryset=WarehouseItem.objects.all(),
        required=False,
        allow_null=True,
    )
    warehouse_item_name = serializers.CharField(
        source='warehouse_item.name',
        read_only=True,
        default=None,
    )
    warehouse_item_stock = serializers.DecimalField(
        source='warehouse_item.quantity',
        max_digits=10,
        decimal_places=2,
        read_only=True,
        default=None,
    )

    class Meta:
        model = GenericComponent
        fields = [
            'id',
            'uuid',
            'name',
            'component_type',
            'component_type_display',
            'rack_units',
            'front_image',
            'front_image_transform',
            'rear_image',
            'rear_image_transform',
            'warehouse_item',
            'warehouse_item_name',
            'warehouse_item_stock',
            'note',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'uuid', 'created_at', 'updated_at']
