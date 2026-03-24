from rest_framework import serializers
from location.models import RackType


class RackTypeSerializer(serializers.ModelSerializer):
    """
    Serializer for the RackType model.

    Fields: id, model, width, height, depth, capacity.
    """
    capacity = serializers.IntegerField(required=True)

    class Meta:
        model = RackType
        fields = ['id', 'model', 'width', 'height', 'depth', 'capacity']
