from django.contrib import admin
from django.db import transaction
from django.utils.html import format_html, mark_safe
from django.utils.translation import gettext_lazy as _

from asset.models import AssetTransitionLog
from asset.models.AssetRequest import AssetRequest, AssetRequestStatus


_STATUS_COLORS = {
    AssetRequestStatus.INSERITA:       ('#3498db', '#fff'),
    AssetRequestStatus.PIANIFICATA:    ('#8e44ad', '#fff'),
    AssetRequestStatus.EVASA:          ('#27ae60', '#fff'),
    AssetRequestStatus.RIFIUTATA:      ('#c0392b', '#fff'),
    AssetRequestStatus.IN_CHIARIMENTO: ('#e67e22', '#fff'),
}


@admin.register(AssetRequest)
class AssetRequestAdmin(admin.ModelAdmin):

    # ── Lista ──────────────────────────────────────────────────────────────────

    list_display = (
        'id',
        'colored_status',
        'request_type',
        'asset_link',
        'from_state',
        'to_state',
        'from_room',
        'to_room',
        'planned_date',
        'created_by',
        'assigned_to',
        'created_at',
    )
    list_filter = ('status', 'request_type', 'created_at', 'planned_date')
    search_fields = (
        'asset__hostname',
        'asset__serial_number',
        'asset__sap_id',
        'created_by__username',
        'assigned_to__username',
        'notes',
    )
    date_hierarchy = 'created_at'
    ordering = ('-created_at',)
    list_select_related = (
        'asset', 'from_state', 'to_state',
        'from_room', 'to_room',
        'created_by', 'assigned_to', 'executed_by',
    )

    # ── Azioni bulk ────────────────────────────────────────────────────────────

    actions = ('action_plan', 'action_execute', 'action_reject')

    @admin.action(description=_('Pianifica le richieste selezionate'))
    def action_plan(self, request, queryset):
        updated = 0
        for req in queryset.filter(status=AssetRequestStatus.INSERITA):
            req.status = AssetRequestStatus.PIANIFICATA
            req.save(update_fields=['status', 'updated_at'])
            updated += 1
        self.message_user(request, _(f'{updated} richieste pianificate.'))

    @admin.action(description=_('Evadi le richieste selezionate'))
    def action_execute(self, request, queryset):
        evadibili = queryset.filter(
            status__in=[AssetRequestStatus.INSERITA, AssetRequestStatus.PIANIFICATA]
        ).select_related('asset', 'asset__state', 'to_state', 'to_room')
        evase = 0
        for req in evadibili:
            try:
                with transaction.atomic():
                    asset = req.asset
                    AssetTransitionLog.objects.create(
                        asset=asset,
                        from_state=asset.state,
                        to_state=req.to_state,
                        from_room=asset.room,
                        to_room=req.to_room,
                        user=request.user,
                        notes=f'[Admin] Richiesta #{req.pk}',
                    )
                    asset.state = req.to_state
                    asset.room = req.to_room
                    asset.save(update_fields=['state', 'room', 'updated_at'])
                    req.status = AssetRequestStatus.EVASA
                    req.executed_by = request.user
                    req.save(update_fields=['status', 'executed_by', 'updated_at'])
                evase += 1
            except Exception as exc:
                self.message_user(
                    request,
                    _(f'Errore su richiesta #{req.pk}: {exc}'),
                    level='error',
                )
        if evase:
            self.message_user(request, _(f'{evase} richieste evase.'))

    @admin.action(description=_('Rifiuta le richieste selezionate'))
    def action_reject(self, request, queryset):
        updated = queryset.filter(
            status__in=[
                AssetRequestStatus.INSERITA,
                AssetRequestStatus.PIANIFICATA,
                AssetRequestStatus.IN_CHIARIMENTO,
            ]
        ).update(
            status=AssetRequestStatus.RIFIUTATA,
            rejection_notes='[Admin] Rifiutata in massa',
        )
        self.message_user(request, _(f'{updated} richieste rifiutate.'))

    # ── Form di dettaglio ──────────────────────────────────────────────────────

    autocomplete_fields = ('asset', 'assigned_to')

    readonly_fields = (
        'status_badge',
        'from_state',
        'from_room',
        'created_by',
        'executed_by',
        'created_at',
        'updated_at',
    )

    fieldsets = (
        (_('Richiesta'), {
            'fields': (
                ('asset', 'request_type'),
                ('status', 'status_badge'),
            ),
        }),
        (_('Transizione pianificata'), {
            'fields': (
                ('from_state', 'to_state'),
                ('from_room',  'to_room'),
            ),
        }),
        (_('Pianificazione'), {
            'fields': (
                ('planned_date', 'assigned_to'),
            ),
        }),
        (_('Note'), {
            'fields': (
                'notes',
                'clarification_notes',
                'rejection_notes',
            ),
        }),
        (_('Utenti e date'), {
            'fields': (
                ('created_by', 'executed_by'),
                ('created_at', 'updated_at'),
            ),
            'classes': ('collapse',),
        }),
    )

    def get_readonly_fields(self, request, obj=None):
        ro = list(self.readonly_fields)
        if obj and obj.status in (AssetRequestStatus.EVASA, AssetRequestStatus.RIFIUTATA):
            ro += [
                'asset', 'request_type', 'status',
                'to_state', 'to_room',
                'planned_date', 'assigned_to',
                'notes', 'clarification_notes', 'rejection_notes',
            ]
        return ro

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
            if not obj.from_state_id:
                obj.from_state = obj.asset.state
            if not obj.from_room_id:
                obj.from_room = obj.asset.room
        super().save_model(request, obj, form, change)

    # ── Colonne custom ─────────────────────────────────────────────────────────

    @admin.display(description=_('Stato'), ordering='status')
    def colored_status(self, obj):
        bg, fg = _STATUS_COLORS.get(obj.status, ('#95a5a6', '#fff'))
        return format_html(
            '<span style="background:{bg};color:{fg};padding:2px 9px;'
            'border-radius:4px;font-weight:600;font-size:.85em;white-space:nowrap">'
            '{label}</span>',
            bg=bg, fg=fg, label=obj.get_status_display(),
        )

    @admin.display(description=_('Stato (badge)'))
    def status_badge(self, obj):
        return self.colored_status(obj)

    @admin.display(description=_('Asset'), ordering='asset__hostname')
    def asset_link(self, obj):
        from django.urls import reverse
        url = reverse('admin:asset_asset_change', args=[obj.asset_id])
        return format_html(
            '<a href="{}">{}</a>',
            url,
            obj.asset.hostname or f'#{obj.asset_id}',
        )
