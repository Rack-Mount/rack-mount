from rest_framework import serializers
from dc.models import Location


class LocationSerializer(serializers.HyperlinkedModelSerializer):
    id = serializers.IntegerField(read_only=True)
    url = serializers.HyperlinkedIdentityField(
        read_only=True, view_name='location-detail')

    class Meta:
        model = Location
        fields = '__all__'
