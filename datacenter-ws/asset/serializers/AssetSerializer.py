from rest_framework import serializers
from asset.models import Asset
from asset.serializers import AssetModelSerializer, AssetStateSerializer


class AssetSerializer(serializers.HyperlinkedModelSerializer):
    """
    Serializer for the Asset model.

    This serializer uses HyperlinkedModelSerializer to serialize the Asset model
    with the following fields:
    - id: Read-only field representing the unique identifier of the asset.
    - model: Nested serializer for the asset model.
    - state: Nested serializer for the asset state.

    Meta:
        model: The model class that is being serialized.
        fields: Specifies that all fields in the model should be included in the serialization.
    """
    id = serializers.ReadOnlyField()
    model = AssetModelSerializer()
    state = AssetStateSerializer()

    class Meta:
        model = Asset
        fields = '__all__'
