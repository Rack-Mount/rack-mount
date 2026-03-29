from django.db import models
from django.contrib.auth.models import User
from django.utils.translation import gettext_lazy as _


class AssetRequestType(models.TextChoices):
    REGISTRATION = 'registration', _('Registration')
    RELOCATION = 'relocation', _('Relocation')
    MAINTENANCE = 'maintenance', _('Maintenance')
    DECOMMISSIONING = 'decommissioning', _('Decommissioning')


class AssetRequestStatus(models.TextChoices):
    SUBMITTED = 'submitted', _('Submitted')
    PLANNED = 'planned', _('Planned')
    EXECUTED = 'executed', _('Executed')
    REJECTED = 'rejected', _('Rejected')
    NEEDS_CLARIFICATION = 'needs_clarification', _('Needs Clarification')


# Allowed transitions between request statuses.
# EXECUTED and REJECTED are terminal states.
ALLOWED_REQUEST_TRANSITIONS: dict[str, set[str]] = {
    AssetRequestStatus.SUBMITTED: {
        AssetRequestStatus.PLANNED,
        AssetRequestStatus.EXECUTED,
        AssetRequestStatus.REJECTED,
        AssetRequestStatus.NEEDS_CLARIFICATION,
    },
    AssetRequestStatus.PLANNED: {
        AssetRequestStatus.EXECUTED,
        AssetRequestStatus.REJECTED,
        AssetRequestStatus.NEEDS_CLARIFICATION,
    },
    AssetRequestStatus.NEEDS_CLARIFICATION: {
        AssetRequestStatus.SUBMITTED,
    },
    AssetRequestStatus.EXECUTED: set(),
    AssetRequestStatus.REJECTED: set(),
}


class AssetRequest(models.Model):
    """
    Request for asset state/location change.

    Any lifecycle change on an asset (registration, relocation,
    maintenance, decommissioning) goes through a request that must be
    submitted, planned and executed before the asset is effectively updated.
    """

    asset = models.ForeignKey(
        'asset.Asset',
        on_delete=models.CASCADE,
        related_name='requests',
        verbose_name=_('Asset'),
    )
    request_type = models.CharField(
        max_length=20,
        choices=AssetRequestType.choices,
        verbose_name=_('Request type'),
    )
    status = models.CharField(
        max_length=20,
        choices=AssetRequestStatus.choices,
        default=AssetRequestStatus.SUBMITTED,
        verbose_name=_('Request status'),
        db_index=True,
    )

    # Planned asset state transition
    from_state = models.ForeignKey(
        'asset.AssetState',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='requests_from',
        verbose_name=_('Source asset state'),
    )
    to_state = models.ForeignKey(
        'asset.AssetState',
        on_delete=models.PROTECT,
        related_name='requests_to',
        verbose_name=_('Target asset state'),
    )

    # Planned room/location transition
    from_room = models.ForeignKey(
        'location.Room',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_requests_from',
        verbose_name=_('Source location'),
    )
    to_room = models.ForeignKey(
        'location.Room',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_requests_to',
        verbose_name=_('Target location'),
    )

    # Content and communication fields
    notes = models.TextField(
        blank=True,
        verbose_name=_('Note'),
        help_text=_('Request rationale or details'),
    )
    clarification_notes = models.TextField(
        blank=True,
        verbose_name=_('Clarification notes'),
        help_text=_('Clarification request sent to the requester'),
    )
    rejection_notes = models.TextField(
        blank=True,
        verbose_name=_('Rejection reason'),
    )

    # Planning
    planned_date = models.DateField(
        null=True,
        blank=True,
        verbose_name=_('Planned date'),
    )

    # Involved users
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='asset_requests_created',
        verbose_name=_('Created by'),
    )
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_requests_assigned',
        verbose_name=_('Assigned to'),
    )
    executed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_requests_executed',
        verbose_name=_('Executed by'),
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'asset_request'
        ordering = ['-created_at']
        verbose_name = _('Asset request')
        verbose_name_plural = _('Asset requests')

    def __str__(self):
        return f'[{self.get_request_type_display()}] {self.asset} → {self.to_state} ({self.get_status_display()})'
