from rest_framework import serializers
from asset.models import Rack
from asset.serializers import RackTypeSerializer


class RackSerializer(serializers.HyperlinkedModelSerializer):
    """
    RackSerializer is a serializer for the Rack model, utilizing HyperlinkedModelSerializer.

    Attributes:
        model (RackTypeSerializer): Serializer for the RackType model.
        room (serializers.StringRelatedField): Read-only field representing the room of the rack.
        location_name (serializers.StringRelatedField): Read-only field representing the location name.

    Meta:
        model (Rack): The model that is being serialized.
        fields (list): List of fields to be included in the serialized output.
    """

    model = RackTypeSerializer()
    room = serializers.StringRelatedField(
        many=False,
        read_only=True
    )
    location_name = serializers.StringRelatedField(
        source='room.location.name',
        read_only=True
    )

    class Meta:
        model = Rack
        fields = ['name', 'model', 'room', 'location_name']
