from rest_framework import serializers
from asset.models import AssetModel
from location.models import WarehouseItem


class CompatibleModelBriefSerializer(serializers.Serializer):
    """Minimal read-only representation of an AssetModel for compatibility."""
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    vendor_name = serializers.SerializerMethodField(read_only=True)

    def get_vendor_name(self, obj) -> str:
        return obj.vendor.name if obj.vendor else ''


class WarehouseItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(
        source='get_category_display', read_only=True
    )
    unit_display = serializers.CharField(
        source='get_unit_display', read_only=True
    )
    below_threshold = serializers.BooleanField(read_only=True)
    installed_count = serializers.SerializerMethodField(read_only=True)
    compatible_models = CompatibleModelBriefSerializer(many=True, read_only=True)
    compatible_model_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        source='compatible_models',
        queryset=AssetModel.objects.all(),
        write_only=True,
        required=False,
    )

    def get_installed_count(self, obj) -> int:
        from asset.models import RackUnit
        return RackUnit.objects.filter(
            generic_component__warehouse_item=obj,
            generic_component__isnull=False,
        ).count()

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
            'installed_count',
            'warehouse',
            'compatible_models',
            'compatible_model_ids',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
