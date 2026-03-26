from rest_framework import serializers
from asset.models import AssetRequest, AssetState
from asset.models.AssetRequest import AssetRequestStatus, ALLOWED_REQUEST_TRANSITIONS
from location.models import Room


class AssetRequestSerializer(serializers.ModelSerializer):
    """Serializer in lettura per una richiesta asset (lista e dettaglio)."""

    asset_hostname = serializers.CharField(source='asset.hostname', read_only=True)
    from_state_name = serializers.CharField(source='from_state.name', read_only=True, default=None)
    to_state_name = serializers.CharField(source='to_state.name', read_only=True)
    from_room_name = serializers.CharField(source='from_room.name', read_only=True, default=None)
    to_room_name = serializers.CharField(source='to_room.name', read_only=True, default=None)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    assigned_to_username = serializers.CharField(source='assigned_to.username', read_only=True, default=None)
    executed_by_username = serializers.CharField(source='executed_by.username', read_only=True, default=None)

    class Meta:
        model = AssetRequest
        fields = [
            'id',
            'asset', 'asset_hostname',
            'request_type',
            'status',
            'from_state', 'from_state_name',
            'to_state', 'to_state_name',
            'from_room', 'from_room_name',
            'to_room', 'to_room_name',
            'notes',
            'clarification_notes',
            'rejection_notes',
            'planned_date',
            'created_by', 'created_by_username',
            'assigned_to', 'assigned_to_username',
            'executed_by', 'executed_by_username',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id', 'status',
            'clarification_notes', 'rejection_notes',
            'created_by', 'created_by_username',
            'executed_by', 'executed_by_username',
            'created_at', 'updated_at',
        ]


class AssetRequestCreateSerializer(serializers.ModelSerializer):
    """Serializer per la creazione di una nuova richiesta."""

    class Meta:
        model = AssetRequest
        fields = [
            'asset',
            'request_type',
            'to_state',
            'to_room',
            'notes',
            'planned_date',
            'assigned_to',
        ]

    def validate(self, attrs):
        asset = attrs['asset']
        to_state = attrs['to_state']

        # Valida la transizione di stato dell'asset
        from asset.models.AssetState import ALLOWED_TRANSITIONS
        from_state = asset.state
        if from_state and from_state.code and to_state.code:
            allowed = ALLOWED_TRANSITIONS.get(from_state.code, set())
            if to_state.code not in allowed:
                raise serializers.ValidationError({
                    'to_state': (
                        f"Transizione non ammessa: {from_state.code} → {to_state.code}. "
                        f"Permesse: {sorted(allowed)}"
                    )
                })
        return attrs

    def create(self, validated_data):
        asset = validated_data['asset']
        validated_data['from_state'] = asset.state
        validated_data['from_room'] = asset.room
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class AssetRequestPlanSerializer(serializers.Serializer):
    """Body per pianificare una richiesta (INSERITA → PIANIFICATA)."""
    planned_date = serializers.DateField(required=False, allow_null=True)
    assigned_to = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class AssetRequestClarifySerializer(serializers.Serializer):
    """Body per richiedere chiarimenti (qualsiasi attivo → IN_CHIARIMENTO)."""
    clarification_notes = serializers.CharField(required=True)


class AssetRequestRejectSerializer(serializers.Serializer):
    """Body per rifiutare una richiesta."""
    rejection_notes = serializers.CharField(required=True)


class AssetRequestResubmitSerializer(serializers.Serializer):
    """Body per reinserire una richiesta dopo chiarimento (IN_CHIARIMENTO → INSERITA)."""
    notes = serializers.CharField(required=False, allow_blank=True)
