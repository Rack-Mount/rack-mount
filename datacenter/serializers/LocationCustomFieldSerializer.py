from rest_framework import serializers
from datacenter.models import LocationCustomField


class LocationCustomFieldSerializer(serializers.HyperlinkedModelSerializer):
    id = serializers.IntegerField(read_only=True)
    url = serializers.HyperlinkedIdentityField(
        read_only=True,
        view_name='locationcustomfield-detail'
    )

    class Meta:
        model = LocationCustomField
        fields = '__all__'
