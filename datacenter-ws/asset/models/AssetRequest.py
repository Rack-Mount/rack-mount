from django.db import models
from django.contrib.auth.models import User
from django.utils.translation import gettext_lazy as _


class AssetRequestType(models.TextChoices):
    REGISTRAZIONE = 'registrazione', _('Registrazione')
    SPOSTAMENTO = 'spostamento', _('Spostamento')
    MANUTENZIONE = 'manutenzione', _('Manutenzione')
    DISMISSIONE = 'dismissione', _('Dismissione')


class AssetRequestStatus(models.TextChoices):
    INSERITA = 'inserita', _('Inserita')
    PIANIFICATA = 'pianificata', _('Pianificata')
    EVASA = 'evasa', _('Evasa')
    RIFIUTATA = 'rifiutata', _('Rifiutata')
    IN_CHIARIMENTO = 'in_chiarimento', _('In Chiarimento')


# Transizioni ammesse tra stati della richiesta.
# EVASA e RIFIUTATA sono terminali.
ALLOWED_REQUEST_TRANSITIONS: dict[str, set[str]] = {
    AssetRequestStatus.INSERITA: {
        AssetRequestStatus.PIANIFICATA,
        AssetRequestStatus.EVASA,
        AssetRequestStatus.RIFIUTATA,
        AssetRequestStatus.IN_CHIARIMENTO,
    },
    AssetRequestStatus.PIANIFICATA: {
        AssetRequestStatus.EVASA,
        AssetRequestStatus.RIFIUTATA,
        AssetRequestStatus.IN_CHIARIMENTO,
    },
    AssetRequestStatus.IN_CHIARIMENTO: {
        AssetRequestStatus.INSERITA,
    },
    AssetRequestStatus.EVASA: set(),
    AssetRequestStatus.RIFIUTATA: set(),
}


class AssetRequest(models.Model):
    """
    Richiesta di cambio stato/posizione per un asset.

    Ogni modifica al ciclo di vita di un asset (registrazione, spostamento,
    manutenzione, dismissione) passa attraverso una richiesta che deve essere
    inserita, pianificata ed evasa prima che l'asset cambi stato effettivamente.
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
        verbose_name=_('Tipo richiesta'),
    )
    status = models.CharField(
        max_length=20,
        choices=AssetRequestStatus.choices,
        default=AssetRequestStatus.INSERITA,
        verbose_name=_('Stato richiesta'),
        db_index=True,
    )

    # Transizione di stato asset prevista
    from_state = models.ForeignKey(
        'asset.AssetState',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='requests_from',
        verbose_name=_('Stato asset di partenza'),
    )
    to_state = models.ForeignKey(
        'asset.AssetState',
        on_delete=models.PROTECT,
        related_name='requests_to',
        verbose_name=_('Stato asset di destinazione'),
    )

    # Transizione di location prevista
    from_room = models.ForeignKey(
        'location.Room',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_requests_from',
        verbose_name=_('Location di partenza'),
    )
    to_room = models.ForeignKey(
        'location.Room',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_requests_to',
        verbose_name=_('Location di destinazione'),
    )

    # Contenuto e comunicazioni
    notes = models.TextField(
        blank=True,
        verbose_name=_('Note'),
        help_text=_('Motivazione o dettagli della richiesta'),
    )
    clarification_notes = models.TextField(
        blank=True,
        verbose_name=_('Note di chiarimento'),
        help_text=_('Richiesta di chiarimento inviata al richiedente'),
    )
    rejection_notes = models.TextField(
        blank=True,
        verbose_name=_('Motivo rifiuto'),
    )

    # Pianificazione
    planned_date = models.DateField(
        null=True,
        blank=True,
        verbose_name=_('Data pianificata'),
    )

    # Utenti coinvolti
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='asset_requests_created',
        verbose_name=_('Creata da'),
    )
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_requests_assigned',
        verbose_name=_('Assegnata a'),
    )
    executed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_requests_executed',
        verbose_name=_('Evasa da'),
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'asset_request'
        ordering = ['-created_at']
        verbose_name = _('Richiesta asset')
        verbose_name_plural = _('Richieste asset')

    def __str__(self):
        return f'[{self.get_request_type_display()}] {self.asset} → {self.to_state} ({self.get_status_display()})'
