from rest_framework import serializers
from asset.models import Rack
from asset.serializers import RackTypeSerializer
from location.serializers import LocationSerializer


class RackSerializer(serializers.HyperlinkedModelSerializer):
    """
    RackSerializer is a serializer for the Rack model, utilizing HyperlinkedModelSerializer.

    Attributes:
        model (RackTypeSerializer): Serializer for the RackType model.
        location (serializers.StringRelatedField): Read-only field representing the location of the rack.
        location_short (serializers.StringRelatedField): Read-only field representing the short name of the location.

    Meta:
        model (Rack): The model that is being serialized.
        fields (list): List of fields to be included in the serialized output.
    """

    model = RackTypeSerializer()
    location = serializers.StringRelatedField(
        many=False,
        read_only=True
    )
    location_short = serializers.StringRelatedField(
        source='location.short_name',
        read_only=True
    )

    class Meta:
        model = Rack
        fields = ['name', 'model', 'location', 'location_short']
