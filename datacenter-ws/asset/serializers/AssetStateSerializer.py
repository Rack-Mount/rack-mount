from rest_framework import serializers
from asset.models import AssetState


class AssetStateSerializer(serializers.ModelSerializer):
    """
    Serializer for the AssetState model.

    This serializer converts AssetState model instances into JSON format and vice versa.
    It includes the following fields:
        - name: The name of the asset state.

    Meta:
        model: The model that is being serialized.
        fields: The fields that are included in the serialization.
    """

    class Meta:
        model = AssetState
        fields = ['name']
