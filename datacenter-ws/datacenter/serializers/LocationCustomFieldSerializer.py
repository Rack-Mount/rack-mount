from rest_framework import serializers
from datacenter.models import LocationCustomField


class LocationCustomFieldSerializer(serializers.HyperlinkedModelSerializer):
    """
    Serializer for the LocationCustomField model.

    This serializer uses HyperlinkedModelSerializer to provide a hyperlinked representation
    of the LocationCustomField model. It includes the following fields:
    - id: An integer field that is read-only.
    - url: A hyperlinked identity field that is read-only and points to the 'locationcustomfield-detail' view.

    Meta:
        model: The model that is being serialized (LocationCustomField).
        fields: Specifies that all fields of the model should be included in the serialization.
    """
    id = serializers.IntegerField(read_only=True)
    url = serializers.HyperlinkedIdentityField(
        read_only=True,
        view_name='locationcustomfield-detail'
    )

    class Meta:
        model = LocationCustomField
        fields = '__all__'
