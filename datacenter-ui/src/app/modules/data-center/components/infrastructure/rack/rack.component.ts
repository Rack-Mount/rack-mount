import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { catchError, combineLatest, concat, map, of, switchMap } from 'rxjs';
import {
  AssetService,
  AssetState,
  Rack,
  RackUnit,
} from '../../../../core/api/v1';
import { RackRender } from '../../../models/RackRender';
import { DeviceComponent } from '../device/device.component';
import {
  BulkRemoveRequest,
  RackDeviceTableComponent,
  RemoveRequest,
  StatePickerRequest,
} from './rack-device-table/rack-device-table.component';
import { RackInstallPanelComponent } from './rack-install-panel/rack-install-panel.component';
import { RackRemoveConfirmComponent } from './rack-remove-confirm/rack-remove-confirm.component';
import { RackStatePickerComponent } from './rack-state-picker/rack-state-picker.component';

type UnitsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; results: RackUnit[] }
  | { status: 'error' };

type RackLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; rack: Rack }
  | { status: 'error' };

/**
 * Fixed vertical overhead NOT including unit rows (must match rack.component.scss):
 *   rack-view padding top+bottom  16+16 = 32 px
 *   chassis border top+bottom      2+2  =  4 px
 *   rack-panel--top  min-height 18px (border-box: border is INSIDE) = 18 px
 *   rack-panel--bottom min-height 18px (border-box: border is INSIDE) = 18 px
 *                                          total  = 72 px
 */
const RACK_OVERHEAD_PX = 72;

@Component({
  selector: 'app-rack',
  imports: [
    DeviceComponent,
    RackInstallPanelComponent,
    RackStatePickerComponent,
    RackRemoveConfirmComponent,
    RackDeviceTableComponent,
  ],
  templateUrl: './rack.component.html',
  styleUrl: './rack.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackComponent {
  readonly rackName = input<string>();
  readonly rackNotFound = output<string>();
  private readonly _rackLoadState = signal<RackLoadState>({
    status: 'loading',
  });
  readonly rack = computed<Rack | undefined>(() => {
    const s = this._rackLoadState();
    return s.status === 'loaded' ? s.rack : undefined;
  });

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly assetService = inject(AssetService);

  /** Height of the parent pane element in px (kept up-to-date by ResizeObserver). */
  private readonly _paneHeight = signal<number>(0);

  /** Bump to force re-fetch of rack units after a position update. */
  readonly _refresh = signal(0);
  /** True = show the rear face of the rack; false = front face (default). */
  readonly _rearView = signal(false);
  /** Device currently being dragged. */
  readonly _dragging = signal<RackUnit | null>(null);
  /** Rack-unit position (1-based from bottom) being targeted as drop destination. */
  readonly _dropTarget = signal<number | null>(null);
  /** True while a PATCH request is in flight. */
  readonly _saving = signal(false);
  /** Error message from the last failed move (null = no error). */
  readonly _moveError = signal<string | null>(null);

  // ── Install panel ─────────────────────────────────────────────────────────

  /** The empty-slot position targeted for installation (null = panel closed). */
  readonly _installPos = signal<number | null>(null);
  /** Viewport top offset (px) for the install panel anchor. */
  readonly _installAnchorY = signal<number>(0);
  /** Viewport left offset (px) for the install panel anchor. */
  readonly _installAnchorX = signal<number>(0);

  // ── Selection ─────────────────────────────────────────────────────────────

  // ── Remove from rack ──────────────────────────────────────────────────────

  /** Rack unit ID pending removal confirmation (null = popover closed). */
  readonly _removeConfirmId = signal<number | null>(null);
  /** Viewport X offset for the remove confirmation popover. */
  readonly _removeConfirmX = signal<number>(0);
  /** Viewport Y offset for the remove confirmation popover. */
  readonly _removeConfirmY = signal<number>(0);
  /** Asset (device) ID associated with the rack unit pending removal. */
  readonly _removeConfirmAssetId = signal<number | null>(null);

  /**
   * ID of the state whose name contains "decomm" or "dismess" (case-insensitive).
   * Used to automatically decommission an asset when it is removed from the rack.
   */
  readonly decommissionedStateId = computed<number | null>(() => {
    const match = this.availableStates().find((s) => {
      const n = s.name.toLowerCase();
      return n.includes('decomm') || n.includes('dismess');
    });
    return match?.id ?? null;
  });

  // ── Bulk remove ───────────────────────────────────────────────────────────

  /** True when the bulk-remove confirmation modal is open. */
  readonly _bulkRemoveConfirm = signal(false);
  /** Rack-unit IDs pre-computed when the bulk-remove modal opens. */
  readonly _bulkRUIdsForConfirm = signal<number[]>([]);
  /** Asset IDs pre-computed when the bulk-remove modal opens. */
  readonly _bulkAssetIdsForConfirm = signal<number[]>([]);

  // ── State picker ──────────────────────────────────────────────────────────

  /** ID of the asset currently being edited for state (null = picker closed). */
  readonly _statePickerDeviceId = signal<number | null>(null);
  /** Viewport X offset for the state picker. */
  readonly _statePickerX = signal<number>(0);
  /** Viewport Y offset for the state picker. */
  readonly _statePickerY = signal<number>(0);
  /** All available asset states, loaded once. */
  readonly availableStates = signal<AssetState[]>([]);

  /**
   * Number of consecutive free U-slots available downward from the install
   * target position (inclusive). Used to prevent installing an oversized device.
   *
   * Rack positions are 1-based from bottom; a device with rack_units=N placed
   * at pos occupies pos, pos-1, ..., pos-N+1.
   */
  readonly _installAvailableU = computed(() => {
    const pos = this._installPos();
    if (!pos) return 0;
    const occ = this._occupancyMap();
    let count = 0;
    for (let p = pos; p >= 1; p--) {
      if (occ.has(p)) break;
      count++;
    }
    return count;
  });

  protected openInstall(pos: number, event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const panelW = 320;
    const panelH = Math.min(460, window.innerHeight * 0.8);
    const idealY = rect.top + rect.height / 2 - panelH / 2;
    this._installAnchorY.set(
      Math.max(8, Math.min(idealY, window.innerHeight - panelH - 8)),
    );
    const idealX = rect.right + 8;
    const clampedX =
      idealX + panelW > window.innerWidth - 4 ? rect.left - panelW - 8 : idealX;
    this._installAnchorX.set(Math.max(4, clampedX));
    this._installPos.set(pos);
  }

  protected closeInstall(): void {
    this._installPos.set(null);
  }

  protected onInstalled(): void {
    this.closeInstall();
    this.refreshRack();
  }

  constructor() {
    afterNextRender(() => {
      // Observe :host itself (not the parent) — :host is flex:1 of rack-pane
      // so its clientHeight is the exact available content height.
      const el = this.el.nativeElement as HTMLElement;
      const obs = new ResizeObserver((entries) => {
        this._paneHeight.set(entries[0]?.contentRect.height ?? 0);
      });
      obs.observe(el);
      this.destroyRef.onDestroy(() => obs.disconnect());
    });

    // Load available states once
    this.assetService
      .assetAssetStateList({ pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.availableStates.set(r.results));

    // Load rack model from the server whenever rackName changes
    toObservable(this.rackName)
      .pipe(
        switchMap((name) => {
          if (!name) return of<RackLoadState>({ status: 'loading' });
          return concat(
            of<RackLoadState>({ status: 'loading' }),
            this.assetService.assetRackRetrieve({ name }).pipe(
              map((rack): RackLoadState => ({ status: 'loaded', rack })),
              catchError(() => {
                this.rackNotFound.emit(name);
                return of<RackLoadState>({ status: 'error' });
              }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this._rackLoadState.set(s));
  }

  /**
   * Optimal per-U row height in px.
   * Scales so the full rack chassis fits the available pane height.
   * Clamped to [20, 48] px to remain legible.
   */
  private readonly _uHeightPx = computed(() => {
    const pane = this._paneHeight();
    const capacity = this.rack()?.model.capacity ?? 0;
    if (!pane || !capacity) return 24;
    const available = pane - RACK_OVERHEAD_PX;
    return Math.min(48, Math.max(14, Math.floor(available / capacity)));
  });

  /** CSS string passed as --u-height custom property on the view wrapper. */
  readonly uHeightCss = computed(() => `${this._uHeightPx()}px`);

  private readonly _unitsState = toSignal<UnitsState>(
    combineLatest([toObservable(this.rack), toObservable(this._refresh)]).pipe(
      switchMap(([rack]) => {
        if (!rack) return of<UnitsState>({ status: 'idle' });
        return concat(
          of<UnitsState>({ status: 'loading' }),
          this.assetService
            .assetRackUnitList({
              rackName: rack.name,
              pageSize: rack.model.capacity,
            })
            .pipe(
              map(
                (r): UnitsState => ({ status: 'loaded', results: r.results }),
              ),
              catchError(() => of<UnitsState>({ status: 'error' })),
            ),
        );
      }),
    ),
  );

  readonly loading = computed(() => this._unitsState()?.status === 'loading');
  readonly error = computed(() => this._unitsState()?.status === 'error');

  readonly occupiedUnits = computed(() => {
    const state = this._unitsState();
    if (!state || state.status !== 'loaded') return 0;
    return state.results.reduce((sum, u) => sum + u.device_rack_units, 0);
  });

  readonly freeUnits = computed(
    () => (this.rack()?.model.capacity ?? 0) - this.occupiedUnits(),
  );

  readonly totalPowerWatt = computed(() => {
    const state = this._unitsState();
    if (!state || state.status !== 'loaded') return 0;
    return state.results.reduce(
      (sum, u) => sum + (u.device_power_watt ?? 0),
      0,
    );
  });

  /** Total power in kW, rounded to 1 decimal. */
  readonly totalPowerKw = computed(
    () => Math.round(this.totalPowerWatt() / 100) / 10,
  );

  /** Total current in Ampere at 230 V, rounded to 1 decimal. */
  readonly totalPowerAmpere = computed(
    () => Math.round(this.totalPowerWatt() / 23) / 10,
  );

  /** Array of indices used to render the loading skeleton rows. */
  readonly skeletonRows = computed(() =>
    Array.from(
      { length: Math.min(this.rack()?.model.capacity ?? 12, 24) },
      (_, i) => i,
    ),
  );

  /** Only the rows that have a device, ordered top-to-bottom. */
  readonly deviceRows = computed(() =>
    this.rackRender().filter((row) => !!row.device),
  );

  protected closeBulkRemoveConfirm(): void {
    this._bulkRemoveConfirm.set(false);
  }

  protected onBulkRemoveConfirmed(): void {
    this.refreshRack();
  }

  protected closeRemoveConfirm(): void {
    this._removeConfirmId.set(null);
    this._removeConfirmAssetId.set(null);
  }

  protected onSingleRemoveConfirmed(): void {
    this.refreshRack();
  }

  /** Bumps the refresh counter (child component clears its own selection via clearTrigger). */
  protected refreshRack(): void {
    this._refresh.update((v) => v + 1);
  }

  protected onRemoveRequest(e: RemoveRequest): void {
    this._removeConfirmX.set(e.anchorX);
    this._removeConfirmY.set(e.anchorY);
    this._removeConfirmId.set(e.rackUnitId);
    this._removeConfirmAssetId.set(e.assetId);
  }

  protected onStatePickerRequest(e: StatePickerRequest): void {
    this._statePickerX.set(e.anchorX);
    this._statePickerY.set(e.anchorY);
    this._statePickerDeviceId.set(e.deviceId);
  }

  protected onBulkRemoveRequest(e: BulkRemoveRequest): void {
    this._bulkRUIdsForConfirm.set(e.rackUnitIds);
    this._bulkAssetIdsForConfirm.set(e.assetIds);
    this._bulkRemoveConfirm.set(true);
  }

  protected closeStatePicker(): void {
    this._statePickerDeviceId.set(null);
  }

  readonly rackRender = computed<RackRender[]>(() => {
    const rack = this.rack();
    if (!rack) return [];

    const capacity = rack.model.capacity;

    // Build empty rows top-to-bottom: index 0 = top unit (position = capacity)
    const rows: RackRender[] = Array.from({ length: capacity }, (_, i) => ({
      rackUnit: 1,
      position: capacity - i,
      visible: true,
    }));

    const state = this._unitsState();
    if (!state || state.status !== 'loaded') return rows;

    for (const asset of state.results) {
      // position is 1-based from bottom; map to 0-based top-down index
      const idx = capacity - asset.position;
      if (idx < 0 || idx >= capacity) continue;

      rows[idx] = {
        device: asset,
        rackUnit: asset.device_rack_units,
        position: rows[idx].position,
        visible: true,
      };

      // Hide rows behind a multi-U device (rows below the top row of the device)
      for (let j = 1; j < asset.device_rack_units; j++) {
        if (idx + j < capacity) rows[idx + j].visible = false;
      }
    }

    return rows;
  });

  // ── Drag-and-drop ─────────────────────────────────────────────────────────

  /** Maps every occupied rack-unit position to the device that holds it. */
  private readonly _occupancyMap = computed(() => {
    const state = this._unitsState();
    if (!state || state.status !== 'loaded') return new Map<number, RackUnit>();
    const m = new Map<number, RackUnit>();
    for (const unit of state.results) {
      for (let i = 0; i < unit.device_rack_units; i++) {
        m.set(unit.position - i, unit); // position = top; extends downward
      }
    }
    return m;
  });

  /** True when `position` falls within the span the dragged device would occupy at _dropTarget. */
  protected isInDropSpan(position: number): boolean {
    const dt = this._dropTarget();
    const device = this._dragging();
    if (dt === null || !device) return false;
    return position <= dt && position > dt - device.device_rack_units;
  }

  /** True when the dragged device can legally be placed with its top at targetPos. */
  protected canDropAt(targetPos: number | null): boolean {
    if (targetPos === null) return false;
    const device = this._dragging();
    if (!device) return false;
    const size = device.device_rack_units;
    const capacity = this.rack()?.model.capacity ?? 0;
    if (targetPos > capacity || targetPos - size + 1 < 1) return false;
    const oMap = this._occupancyMap();
    for (let pos = targetPos; pos > targetPos - size; pos--) {
      const occupant = oMap.get(pos);
      if (occupant && occupant.id !== device.id) return false;
    }
    return true;
  }

  protected onDragStart(ev: DragEvent, device: RackUnit): void {
    ev.dataTransfer?.setData('text/plain', String(device.id));
    // Small delay so the ghost image is captured before we dim the row
    setTimeout(() => this._dragging.set(device), 0);
    this._dropTarget.set(null);
  }

  protected onDragEnd(): void {
    this._dragging.set(null);
    this._dropTarget.set(null);
  }

  protected onDragOver(ev: DragEvent, position: number): void {
    if (!this._dragging()) return;
    ev.preventDefault();
    if (this._dropTarget() !== position) this._dropTarget.set(position);
  }

  protected onDragLeave(ev: DragEvent): void {
    const related = ev.relatedTarget as HTMLElement | null;
    if (!related?.closest('.rack-units')) this._dropTarget.set(null);
  }

  protected onDrop(ev: DragEvent, targetPos: number): void {
    ev.preventDefault();
    const device = this._dragging();
    // Evaluate canDropAt BEFORE resetting _dragging (it reads the signal internally)
    const allowed =
      !!device && this.canDropAt(targetPos) && device.position !== targetPos;
    this._dragging.set(null);
    this._dropTarget.set(null);
    if (!allowed || !device) return;
    this._saving.set(true);
    this._moveError.set(null);
    this.assetService
      .assetRackUnitPartialUpdate({
        id: device.id,
        patchedRackUnit: { position: targetPos },
      })
      .subscribe({
        next: () => {
          this._saving.set(false);
          this.refreshRack();
        },
        error: () => {
          this._saving.set(false);
          this._moveError.set(
            `Impossibile spostare ${device.device_hostname || 'apparato'} in posizione ${targetPos}U`,
          );
          setTimeout(() => this._moveError.set(null), 4000);
        },
      });
  }
}
