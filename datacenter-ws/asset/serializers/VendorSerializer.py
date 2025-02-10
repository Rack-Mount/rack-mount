from rest_framework import serializers
from asset.models import Vendor
from asset.serializers import VendorSerializer


class VendorSerializer(serializers.ModelSerializer):
    """
    Serializer for the Vendor model.

    This serializer converts Vendor model instances into JSON format and vice versa.
    It includes the following fields:
        - name: The name of the vendor.

    Attributes:
        Meta (class): Meta options for the VendorSerializer.
            model (Vendor): The model that is being serialized.
            fields (list): The list of fields to be included in the serialization.
    """

    class Meta:
        model = Vendor
        fields = ['name']
