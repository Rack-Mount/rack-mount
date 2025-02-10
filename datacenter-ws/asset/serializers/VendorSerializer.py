from rest_framework import serializers
from asset.models import Vendor
from asset.serializers import VendorSerializer


class VendorSerializer(serializers.ModelSerializer):
    model = Vendor()

    class Meta:
        model = Vendor
        fields = '__all__'
