from rest_framework import serializers
from asset.models import Rack, RackType
from location.models.Room import Room
from asset.serializers import RackTypeSerializer


class RackSerializer(serializers.HyperlinkedModelSerializer):
    """
    RackSerializer is a serializer for the Rack model, utilizing HyperlinkedModelSerializer.

    Attributes:
        model (RackTypeSerializer): Serializer for the RackType model (read).
        model_id (PrimaryKeyRelatedField): Write-only FK to RackType for creation/update.
        room (serializers.StringRelatedField): Read-only field representing the room of the rack.
        room_id (PrimaryKeyRelatedField): Write-only FK to Room for creation/update.
        location_name (serializers.StringRelatedField): Read-only field representing the location name.

    Meta:
        model (Rack): The model that is being serialized.
        fields (list): List of fields to be included in the serialized output.
    """

    model = RackTypeSerializer(read_only=True)
    model_id = serializers.PrimaryKeyRelatedField(
        queryset=RackType.objects.all(),
        source='model',
    )
    room = serializers.StringRelatedField(
        many=False,
        read_only=True
    )
    room_id = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.all(),
        source='room',
        allow_null=True,
        required=False,
    )
    location_name = serializers.StringRelatedField(
        source='room.location.name',
        read_only=True
    )
    used_units = serializers.IntegerField(read_only=True, default=0)
    total_power_watt = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Rack
        fields = ['id', 'name', 'model', 'model_id',
                  'room', 'room_id', 'location_name', 'used_units', 'total_power_watt']
