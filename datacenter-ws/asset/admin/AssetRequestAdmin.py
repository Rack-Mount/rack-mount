from django.contrib import admin
from django.db import transaction
from django.utils.html import format_html, mark_safe
from django.utils.translation import gettext_lazy as _

from asset.models import AssetTransitionLog
from asset.models.AssetRequest import AssetRequest, AssetRequestStatus


_STATUS_COLORS = {
    AssetRequestStatus.SUBMITTED:           ('#3498db', '#fff'),
    AssetRequestStatus.PLANNED:             ('#8e44ad', '#fff'),
    AssetRequestStatus.EXECUTED:            ('#27ae60', '#fff'),
    AssetRequestStatus.REJECTED:            ('#c0392b', '#fff'),
    AssetRequestStatus.NEEDS_CLARIFICATION: ('#e67e22', '#fff'),
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

    @admin.action(description=_('Plan selected requests'))
    def action_plan(self, request, queryset):
        updated = 0
        for req in queryset.filter(status=AssetRequestStatus.SUBMITTED):
            req.status = AssetRequestStatus.PLANNED
            req.save(update_fields=['status', 'updated_at'])
            updated += 1
        self.message_user(request, _('%d requests planned.') % updated)

    @admin.action(description=_('Execute selected requests'))
    def action_execute(self, request, queryset):
        evadibili = queryset.filter(
            status__in=[AssetRequestStatus.SUBMITTED, AssetRequestStatus.PLANNED]
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
                        notes=f'[Admin] Request #{req.pk}',
                    )
                    asset.state = req.to_state
                    asset.room = req.to_room
                    asset.save(update_fields=['state', 'room', 'updated_at'])
                    req.status = AssetRequestStatus.EXECUTED
                    req.executed_by = request.user
                    req.save(update_fields=['status', 'executed_by', 'updated_at'])
                evase += 1
            except Exception as exc:
                self.message_user(
                    request,
                    _('Error on request #%(pk)d: %(error)s') % {'pk': req.pk, 'error': exc},
                    level='error',
                )
        if evase:
            self.message_user(request, _('%d requests executed.') % evase)

    @admin.action(description=_('Reject selected requests'))
    def action_reject(self, request, queryset):
        updated = queryset.filter(
            status__in=[
                AssetRequestStatus.SUBMITTED,
                AssetRequestStatus.PLANNED,
                AssetRequestStatus.NEEDS_CLARIFICATION,
            ]
        ).update(
            status=AssetRequestStatus.REJECTED,
            rejection_notes='[Admin] Bulk rejected',
        )
        self.message_user(request, _('%d requests rejected.') % updated)

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
        (_('Request'), {
            'fields': (
                ('asset', 'request_type'),
                ('status', 'status_badge'),
            ),
        }),
        (_('Planned transition'), {
            'fields': (
                ('from_state', 'to_state'),
                ('from_room',  'to_room'),
            ),
        }),
        (_('Planning'), {
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
        (_('Users and dates'), {
            'fields': (
                ('created_by', 'executed_by'),
                ('created_at', 'updated_at'),
            ),
            'classes': ('collapse',),
        }),
    )

    def get_readonly_fields(self, request, obj=None):
        ro = list(self.readonly_fields)
        if obj and obj.status in (AssetRequestStatus.EXECUTED, AssetRequestStatus.REJECTED):
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

    @admin.display(description=_('Status'), ordering='status')
    def colored_status(self, obj):
        bg, fg = _STATUS_COLORS.get(obj.status, ('#95a5a6', '#fff'))
        return format_html(
            '<span style="background:{bg};color:{fg};padding:2px 9px;'
            'border-radius:4px;font-weight:600;font-size:.85em;white-space:nowrap">'
            '{label}</span>',
            bg=bg, fg=fg, label=obj.get_status_display(),
        )

    @admin.display(description=_('Status (badge)'))
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
