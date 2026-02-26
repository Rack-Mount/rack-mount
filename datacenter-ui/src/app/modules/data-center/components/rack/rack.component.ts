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
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, concat, map, of, switchMap } from 'rxjs';
import { AssetService, Rack, RackUnit } from '../../../core/api/v1';
import { RackRender } from '../../models/RackRender';
import { DeviceComponent } from '../device/device.component';

type UnitsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; results: RackUnit[] }
  | { status: 'error' };

/**
 * Fixed vertical overhead NOT including unit rows:
 * rack-view padding (32) + rack-col gap (8)
 * + rack-header (36) + top panel (18) + bottom panel (18) + chassis borders (4)
 * = 116 px  →  use 120 as safe buffer.
 */
const RACK_OVERHEAD_PX = 120;

@Component({
  selector: 'app-rack',
  imports: [DeviceComponent],
  templateUrl: './rack.component.html',
  styleUrl: './rack.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackComponent {
  readonly rack = input<Rack>();

  private readonly el         = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly assetService = inject(AssetService);

  /** Height of the parent pane element in px (kept up-to-date by ResizeObserver). */
  private readonly _paneHeight = signal<number>(0);

  constructor() {
    afterNextRender(() => {
      // Observe :host itself (not the parent) — :host is flex:1 of rack-pane
      // so its clientHeight is the exact available content height.
      const el = this.el.nativeElement as HTMLElement;
      const obs = new ResizeObserver(entries => {
        this._paneHeight.set(entries[0]?.contentRect.height ?? 0);
      });
      obs.observe(el);
      this.destroyRef.onDestroy(() => obs.disconnect());
    });
  }

  /**
   * Optimal per-U row height in px.
   * Scales so the full rack chassis fits the available pane height.
   * Clamped to [20, 48] px to remain legible.
   */
  private readonly _uHeightPx = computed(() => {
    const pane     = this._paneHeight();
    const capacity = this.rack()?.model.capacity ?? 0;
    if (!pane || !capacity) return 24;
    // Overhead: rack-view padding 32 + chassis border 4
    //           + top-panel 18 + bottom-panel 18 = 72 → 80 buffer
    const available = pane - 80;
    // Min 14px: still readable at small heights; max 48px for large screens
    return Math.min(48, Math.max(14, Math.floor(available / capacity)));
  });

  /** CSS string passed as --u-height custom property on the view wrapper. */
  readonly uHeightCss = computed(() => `${this._uHeightPx()}px`);


  private readonly _unitsState = toSignal<UnitsState>(
    toObservable(this.rack).pipe(
      switchMap((rack) => {
        if (!rack) return of<UnitsState>({ status: 'idle' });
        return concat(
          of<UnitsState>({ status: 'loading' }),
          this.assetService
            .assetRackUnitList({ rackName: rack.name, pageSize: rack.model.capacity })
            .pipe(
              map((r): UnitsState => ({ status: 'loaded', results: r.results })),
              catchError(() => of<UnitsState>({ status: 'error' })),
            ),
        );
      }),
    ),
  );

  readonly loading = computed(() => this._unitsState()?.status === 'loading');
  readonly error   = computed(() => this._unitsState()?.status === 'error');

  readonly occupiedUnits = computed(() => {
    const state = this._unitsState();
    if (!state || state.status !== 'loaded') return 0;
    return state.results.reduce((sum, u) => sum + u.device_rack_units, 0);
  });

  readonly freeUnits = computed(() =>
    (this.rack()?.model.capacity ?? 0) - this.occupiedUnits(),
  );

  /** Array of indices used to render the loading skeleton rows. */
  readonly skeletonRows = computed(() =>
    Array.from({ length: Math.min(this.rack()?.model.capacity ?? 12, 24) }, (_, i) => i),
  );

  /** Only the rows that have a device, ordered top-to-bottom. */
  readonly deviceRows = computed(() =>
    this.rackRender().filter(row => !!row.device),
  );

  /** Map a raw device_type string to the same CSS modifier key used by DeviceComponent. */
  protected typeClass(type?: string): string {
    const t = (type ?? '').toLowerCase();
    const map: Record<string, string> = {
      server: 'server', switch: 'switch', router: 'router',
      firewall: 'firewall', storage: 'storage', pdu: 'pdu', kvm: 'kvm', ups: 'ups',
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
}

