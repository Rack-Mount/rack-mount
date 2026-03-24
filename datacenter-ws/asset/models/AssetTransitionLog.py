from django.conf import settings
from django.db import models


class AssetTransitionLog(models.Model):
    """
    Records every state/location change of an asset (movement log).

    Fields:
        asset       — the asset that moved
        from_state  — previous state (null on first entry)
        to_state    — new state
        from_room   — previous room (null on first entry or when racked)
        to_room     — destination room (null when the move is out-of-system)
        user        — who performed the move
        notes       — optional motivation / notes
        timestamp   — auto-set on creation
    """

    asset = models.ForeignKey(
        'Asset', on_delete=models.CASCADE, related_name='transitions'
    )
    from_state = models.ForeignKey(
        'AssetState', on_delete=models.PROTECT,
        null=True, blank=True, related_name='transitions_from'
    )
    to_state = models.ForeignKey(
        'AssetState', on_delete=models.PROTECT,
        related_name='transitions_to'
    )
    from_room = models.ForeignKey(
        'location.Room', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='transitions_from'
    )
    to_room = models.ForeignKey(
        'location.Room', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='transitions_to'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='asset_transitions'
    )
    notes = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self):
        return (
            f'{self.asset} | {self.from_state} → {self.to_state} '
            f'| {self.timestamp:%Y-%m-%d %H:%M}'
        )

    class Meta:
        db_table = 'asset_transition_log'
        ordering = ['-timestamp']
