from rest_framework import serializers
from asset.models import AssetType


class AssetTypeSerializer(serializers.ModelSerializer):
    """
    Serializer for the AssetType model.

    This serializer converts AssetType model instances into JSON format and vice versa.
    It includes the following fields:
        - name: The name of the asset type.

    Attributes:
        Meta (class): Meta options for the serializer.
            model (AssetType): The model that is being serialized.
            fields (list): The list of fields to be included in the serialization.
    """

    class Meta:
        model = AssetType
        fields = ['id', 'name']
