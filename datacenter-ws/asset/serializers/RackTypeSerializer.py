from rest_framework import serializers
from asset.models import RackType


class RackTypeSerializer(serializers.HyperlinkedModelSerializer):
    """
    RackTypeSerializer is a HyperlinkedModelSerializer for the RackType model.

    This serializer includes the following fields:
    - model: The model of the rack type.
    - width: The width of the rack type.
    - height: The height of the rack type.
    - capacity: The capacity of the rack type.

    Meta:
        model: The RackType model that is being serialized.
        fields: A list of fields to be included in the serialized representation.
    """
    capacity = serializers.IntegerField(required=True)

    class Meta:
        model = RackType
        fields = ['model', 'width', 'height', 'capacity']
