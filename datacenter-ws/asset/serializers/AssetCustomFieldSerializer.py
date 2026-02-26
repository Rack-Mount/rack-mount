from rest_framework import serializers
from asset.models import AssetCustomField


class AssetCustomFieldSerializer(serializers.ModelSerializer):
    asset_id = serializers.IntegerField(
        source='asset.id',
        read_only=True
    )
    asset_hostname = serializers.StringRelatedField(
        source='asset.hostname',
        many=False,
        read_only=True
    )

    field_name = serializers.StringRelatedField(
        source='field_name.name',
        many=False,
        read_only=True
    )

    class Meta:
        model = AssetCustomField
        fields = ['id', 'asset_id', 'asset_hostname',
                  'field_name', 'field_value']
