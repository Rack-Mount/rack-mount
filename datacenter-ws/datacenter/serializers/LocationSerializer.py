from rest_framework import serializers
from datacenter.models import Location
from datacenter.serializers import LocationCustomFieldSerializer
from datacenter.serializers.RoomSerializer import RoomSerializer


class LocationSerializer(serializers.HyperlinkedModelSerializer):
    """
    LocationSerializer is a HyperlinkedModelSerializer for the Location model.

    Fields:
        id (IntegerField): Read-only field for the unique identifier of the location.
        url (HyperlinkedIdentityField): Read-only field for the URL of the location detail view.
        custom_fields (LocationCustomFieldSerializer): Read-only field for the custom fields associated with the location.
        rooms (RoomSerializer): Read-only nested list of rooms belonging to this location.

    Meta:
        model (Location): The model that is being serialized.
        fields (str): Specifies that all fields of the model should be included in the serialization.
    """
    id = serializers.IntegerField(read_only=True)
    url = serializers.HyperlinkedIdentityField(
        read_only=True, view_name='location-detail')
    custom_fields = LocationCustomFieldSerializer(
        many=True, read_only=True)
    rooms = RoomSerializer(many=True, read_only=True)

    class Meta:
        model = Location
        fields = '__all__'
