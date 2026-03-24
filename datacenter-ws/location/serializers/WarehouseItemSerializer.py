from rest_framework import serializers
from location.models import WarehouseItem


class WarehouseItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(
        source='get_category_display', read_only=True
    )
    unit_display = serializers.CharField(
        source='get_unit_display', read_only=True
    )
    below_threshold = serializers.BooleanField(read_only=True)

    class Meta:
        model = WarehouseItem
        fields = [
            'id',
            'name',
            'category',
            'category_display',
            'specs',
            'quantity',
            'unit',
            'unit_display',
            'min_threshold',
            'below_threshold',
            'warehouse',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
