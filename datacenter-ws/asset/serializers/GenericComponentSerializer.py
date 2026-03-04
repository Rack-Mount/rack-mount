from rest_framework import serializers
from asset.models import GenericComponent


class GenericComponentSerializer(serializers.ModelSerializer):
    """
    Serializer for GenericComponent model.

    Exposes all fields of a generic/consumable rack-mounted component.
    """

    component_type_display = serializers.CharField(
        source='get_component_type_display',
        read_only=True,
    )

    class Meta:
        model = GenericComponent
        fields = [
            'id',
            'name',
            'component_type',
            'component_type_display',
            'rack_units',
            'note',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
