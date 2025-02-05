from rest_framework import serializers
from dc.models import Location
from dc.serializers import LocationCustomFieldSerializer


class LocationSerializer(serializers.HyperlinkedModelSerializer):
    id = serializers.IntegerField(read_only=True)
    url = serializers.HyperlinkedIdentityField(
        read_only=True, view_name='location-detail')
    custom_fields = LocationCustomFieldSerializer(
        many=True, read_only=True)

    class Meta:
        model = Location
        fields = '__all__'
