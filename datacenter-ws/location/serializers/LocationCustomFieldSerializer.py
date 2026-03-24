from rest_framework import serializers
from asset.models import CustomFieldName
from location.models import LocationCustomField


class LocationCustomFieldSerializer(serializers.HyperlinkedModelSerializer):
    """
    Serializer for the LocationCustomField model.
    """
    id = serializers.IntegerField(read_only=True)
    url = serializers.HyperlinkedIdentityField(
        read_only=True,
        view_name='locationcustomfield-detail'
    )

    field_name = serializers.StringRelatedField(
        source='field_name.name',
        read_only=True,
    )
    field_name_id = serializers.PrimaryKeyRelatedField(
        queryset=CustomFieldName.objects.all(),
        source='field_name',
        write_only=True,
    )

    class Meta:
        model = LocationCustomField
        fields = ['id', 'url', 'location', 'field_name', 'field_name_id', 'field_value']
