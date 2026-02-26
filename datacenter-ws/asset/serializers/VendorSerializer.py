from rest_framework import serializers
from asset.models import Vendor


class VendorSerializer(serializers.ModelSerializer):
    """
    Serializer for the Vendor model.
    """

    class Meta:
        model = Vendor
        fields = ['id', 'name']
