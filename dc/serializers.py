from rest_framework import serializers
from .models import DataCenterLocation


class DataCenterLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataCenterLocation
        fields = '__all__'
