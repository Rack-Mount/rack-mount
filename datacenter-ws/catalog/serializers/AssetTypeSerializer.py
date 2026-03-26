from rest_framework import serializers
from catalog.models import AssetType


class AssetTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetType
        fields = ['id', 'name']
