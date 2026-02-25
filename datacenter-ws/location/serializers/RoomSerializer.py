from rest_framework import serializers
from location.models import Room


class RoomSerializer(serializers.HyperlinkedModelSerializer):
    """
    RoomSerializer is a HyperlinkedModelSerializer for the Room model.

    Fields:
        id (IntegerField): Read-only field for the unique identifier of the room.
        url (HyperlinkedIdentityField): Read-only field for the URL of the room detail view.
        floor_plan_url (SerializerMethodField): Absolute URL of the floor plan image, if present.

    Meta:
        model (Room): The model that is being serialized.
        fields (str): Specifies that all fields of the model should be included in the serialization.
    """
    id = serializers.IntegerField(read_only=True)
    url = serializers.HyperlinkedIdentityField(
        read_only=True, view_name='room-detail')
    floor_plan_url = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = '__all__'

    def get_floor_plan_url(self, obj):
        request = self.context.get('request')
        if obj.floor_plan and request:
            return request.build_absolute_uri(obj.floor_plan.url)
        return None
