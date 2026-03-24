from rest_framework import serializers
from asset.models import AssetTransitionLog


class AssetTransitionLogSerializer(serializers.ModelSerializer):
    from_state_name = serializers.CharField(
        source='from_state.name', read_only=True, default=None
    )
    to_state_name = serializers.CharField(
        source='to_state.name', read_only=True
    )
    from_room_name = serializers.CharField(
        source='from_room.name', read_only=True, default=None
    )
    to_room_name = serializers.CharField(
        source='to_room.name', read_only=True, default=None
    )
    username = serializers.CharField(
        source='user.username', read_only=True
    )

    class Meta:
        model = AssetTransitionLog
        fields = [
            'id',
            'from_state', 'from_state_name',
            'to_state', 'to_state_name',
            'from_room', 'from_room_name',
            'to_room', 'to_room_name',
            'user', 'username',
            'notes',
            'timestamp',
        ]
        read_only_fields = fields
