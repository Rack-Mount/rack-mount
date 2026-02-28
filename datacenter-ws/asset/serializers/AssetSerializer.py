from rest_framework import serializers
from asset.models import Asset, AssetModel, AssetState
from asset.serializers import AssetModelSerializer, AssetStateSerializer


class AssetSerializer(serializers.HyperlinkedModelSerializer):
    """
    Serializer for the Asset model.

    This serializer uses HyperlinkedModelSerializer to serialize the Asset model
    with the following fields:
    - id: Read-only field representing the unique identifier of the asset.
    - model: Nested serializer for the asset model (read-only).
    - state: Nested serializer for the asset state (read-only).
    - model_id: Write-only PK field for setting the model on create/update.
    - state_id: Write-only PK field for setting the state on create/update.

    Meta:
        model: The model class that is being serialized.
        fields: Specifies that all fields in the model should be included in the serialization.
    """
    id = serializers.ReadOnlyField()
    model = AssetModelSerializer(read_only=True)
    state = AssetStateSerializer(read_only=True)
    model_id = serializers.PrimaryKeyRelatedField(
        queryset=AssetModel.objects.all(),
        source='model',
        write_only=True,
    )
    state_id = serializers.PrimaryKeyRelatedField(
        queryset=AssetState.objects.all(),
        source='state',
        write_only=True,
    )

    class Meta:
        model = Asset
        fields = '__all__'
