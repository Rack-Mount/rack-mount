from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from location.models import Room


@extend_schema_field(
    field={
        'type': 'array',
        'items': {'type': 'object', 'additionalProperties': True},
        'nullable': True,
    }
)
class FloorPlanDataField(serializers.JSONField):
    """JSONField with an explicit OpenAPI schema so the generator emits Array<object>."""
    pass


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
    floor_plan_data = FloorPlanDataField(allow_null=True, required=False)

    class Meta:
        model = Room
        fields = '__all__'

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_floor_plan_url(self, obj) -> str | None:
        request = self.context.get('request')
        if obj.floor_plan and request:
            return request.build_absolute_uri(obj.floor_plan.url)
        return None
