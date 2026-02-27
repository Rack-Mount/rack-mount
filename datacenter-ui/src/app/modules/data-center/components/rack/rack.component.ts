import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  toObservable,
  takeUntilDestroyed,
  toSignal,
} from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  concat,
  debounceTime,
  map,
  merge,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import {
  Asset,
  AssetService,
  AssetState,
  Rack,
  RackUnit,
} from '../../../core/api/v1';
import { RackRender } from '../../models/RackRender';
import { DeviceComponent } from '../device/device.component';

type UnitsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; results: RackUnit[] }
  | { status: 'error' };

type InstallAssetsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; results: Asset[] }
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
  imports: [DeviceComponent, FormsModule],
  templateUrl: './rack.component.html',
  styleUrl: './rack.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackComponent {
  readonly rack = input<Rack>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly assetService = inject(AssetService);

  /** Height of the parent pane element in px (kept up-to-date by ResizeObserver). */
  private readonly _paneHeight = signal<number>(0);

  /** Bump to force re-fetch of rack units after a position update. */
  private readonly _refresh = signal(0);
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
  /** Current search text in the install panel. */
  readonly _installSearch = signal('');
  /** ID of the asset selected in the install panel. */
  readonly _installSelectedId = signal<number | null>(null);
  /** True while the POST is in-flight. */
  readonly _installSaving = signal(false);
  /** Error from a failed install attempt. */
  readonly _installError = signal<string | null>(null);

  // ── State picker ──────────────────────────────────────────────────────────

  /** ID of the asset currently being edited for state (null = picker closed). */
  readonly _statePickerDeviceId = signal<number | null>(null);
  /** Viewport X offset for the state picker. */
  readonly _statePickerX = signal<number>(0);
  /** Viewport Y offset for the state picker. */
  readonly _statePickerY = signal<number>(0);
  /** True while the state PATCH is in flight. */
  readonly _stateUpdateSaving = signal(false);
  /** All available asset states, loaded once. */
  readonly availableStates = signal<AssetState[]>([]);

  // Two separate channels: immediate (no debounce, used on open) and typed (debounced)
  private readonly _installImmediateSubject = new Subject<string>();
  private readonly _installTypeSubject = new Subject<string>();

  readonly _installAssetsState = signal<InstallAssetsState>({ status: 'idle' });

  readonly installableAssets = computed<Asset[]>(() => {
    const state = this._installAssetsState();
    return state.status === 'loaded' ? state.results : [];
  });

  protected openInstall(pos: number, event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const panelW = 320;
    const panelH = Math.min(460, window.innerHeight * 0.8);
    // vertical: center panel on the slot row, clamped to viewport
    const idealY = rect.top + rect.height / 2 - panelH / 2;
    this._installAnchorY.set(
      Math.max(8, Math.min(idealY, window.innerHeight - panelH - 8)),
    );
    // horizontal: just to the right of the slot, fall back left if too close to edge
    const idealX = rect.right + 8;
    const clampedX =
      idealX + panelW > window.innerWidth - 4 ? rect.left - panelW - 8 : idealX;
    this._installAnchorX.set(Math.max(4, clampedX));
    this._installPos.set(pos);
    this._installSelectedId.set(null);
    this._installError.set(null);
    this._installSearch.set('');
    this._installImmediateSubject.next(''); // load all assets immediately, no debounce
  }

  protected closeInstall(): void {
    this._installPos.set(null);
    this._installSelectedId.set(null);
    this._installSearch.set('');
    this._installError.set(null);
  }

  protected onInstallSearch(value: string): void {
    this._installSearch.set(value);
    this._installTypeSubject.next(value); // debounced channel
  }

  protected installAsset(assetId: number): void {
    this._installSelectedId.set(assetId);
    this.confirmInstall();
  }

  protected confirmInstall(): void {
    const pos = this._installPos();
    const assetId = this._installSelectedId();
    const rack = this.rack();
    if (!pos || !assetId || !rack) return;
    this._installSaving.set(true);
    this._installError.set(null);
    this.assetService
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .assetRackUnitCreate({
        rackUnit: { rack: rack.id, device: assetId, position: pos } as any,
      })
      .subscribe({
        next: () => {
          this._installSaving.set(false);
          this.closeInstall();
          this._refresh.update((v) => v + 1);
        },
        error: () => {
          this._installSaving.set(false);
          this._installError.set(
            "Installazione non riuscita: verificare che la posizione sia libera e l'apparato non sia già installato.",
          );
        },
      });
  }

  constructor() {
    // ── Install panel search ──────────────────────────────────────────────────
    merge(
      this._installImmediateSubject,
      this._installTypeSubject.pipe(debounceTime(250)),
    )
      .pipe(
        switchMap((search) =>
          concat(
            of<InstallAssetsState>({ status: 'loading' }),
            this.assetService
              .assetAssetList({ search, pageSize: 5, notInRack: true })
              .pipe(
                map(
                  (r): InstallAssetsState => ({
                    status: 'loaded',
                    results: r.results,
                  }),
                ),
                catchError(() => of<InstallAssetsState>({ status: 'error' })),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this._installAssetsState.set(state));

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

  protected openStatePicker(deviceId: number, event: MouseEvent): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pickerW = 180;
    const pickerH = Math.min(this.availableStates().length * 34 + 8, 260);
    const idealX = rect.right + 6;
    const x =
      idealX + pickerW > window.innerWidth - 4
        ? rect.left - pickerW - 4
        : idealX;
    const idealY = rect.top - 4;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - pickerH - 4));
    this._statePickerX.set(x);
    this._statePickerY.set(y);
    this._statePickerDeviceId.set(deviceId);
  }

  protected closeStatePicker(): void {
    this._statePickerDeviceId.set(null);
  }

  protected pickState(stateId: number): void {
    const deviceId = this._statePickerDeviceId();
    if (!deviceId) return;
    this._stateUpdateSaving.set(true);
    this.assetService
      .assetAssetPartialUpdate({
        id: deviceId,
        patchedAsset: { state_id: stateId } as any,
      })
      .subscribe({
        next: () => {
          this._stateUpdateSaving.set(false);
          this.closeStatePicker();
          this._refresh.update((v) => v + 1);
        },
        error: () => {
          this._stateUpdateSaving.set(false);
        },
      });
  }

  /** Map a raw device_type string to the same CSS modifier key used by DeviceComponent. */
  protected typeClass(type?: string): string {
    const t = (type ?? '').toLowerCase();
    const map: Record<string, string> = {
      server: 'server',
      switch: 'switch',
      router: 'router',
      firewall: 'firewall',
      storage: 'storage',
      pdu: 'pdu',
      kvm: 'kvm',
      ups: 'ups',
    };
    return map[t] ?? 'other';
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
          this._refresh.update((v) => v + 1);
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
