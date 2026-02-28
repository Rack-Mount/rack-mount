import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { skip } from 'rxjs';
import { RackRender } from '../../../models/RackRender';

export interface RemoveRequest {
  rackUnitId: number;
  assetId: number;
  anchorX: number;
  anchorY: number;
}

export interface StatePickerRequest {
  deviceId: number;
  anchorX: number;
  anchorY: number;
}

export interface BulkRemoveRequest {
  rackUnitIds: number[];
  assetIds: number[];
}

@Component({
  selector: 'app-rack-device-table',
  imports: [],
  templateUrl: './rack-device-table.component.html',
  styleUrl: './rack-device-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackDeviceTableComponent {
  private readonly destroyRef = inject(DestroyRef);

  /** Device rows to display (already filtered to occupied slots). */
  readonly rows = input.required<RackRender[]>();
  /** Increment to clear selection — wire to parent's refresh counter. */
  readonly clearTrigger = input<number>(0);
  /** Number of available states (used to size the state-picker popover). */
  readonly availableStatesCount = input<number>(5);

  readonly removeRequest = output<RemoveRequest>();
  readonly statePickerRequest = output<StatePickerRequest>();
  readonly bulkRemoveRequest = output<BulkRemoveRequest>();

  // ── Selection ─────────────────────────────────────────────────────────────

  readonly _selectedIds = signal<ReadonlySet<number>>(new Set());
  readonly selectedCount = computed(() => this._selectedIds().size);
  readonly allSelected = computed(() => {
    const r = this.rows();
    return (
      r.length > 0 && r.every((row) => this._selectedIds().has(row.device!.id))
    );
  });
  readonly someSelected = computed(
    () => this._selectedIds().size > 0 && !this.allSelected(),
  );

  constructor() {
    // Clear selection whenever the parent refreshes (skip initial emission)
    toObservable(this.clearTrigger)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this._selectedIds.set(new Set()));
  }

  protected toggleSelect(id: number, checked: boolean): void {
    this._selectedIds.update((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected toggleSelectAll(checked: boolean): void {
    this._selectedIds.set(
      checked ? new Set(this.rows().map((r) => r.device!.id)) : new Set(),
    );
  }

  protected clearSelection(): void {
    this._selectedIds.set(new Set());
  }

  protected onBulkRemoveClick(): void {
    const ids = [...this._selectedIds()];
    const ruToAsset = new Map(
      this.rows()
        .filter((r) => !!r.device)
        .map((r) => [r.device!.id, +r.device!.device_id]),
    );
    const assetIds = ids
      .map((id) => ruToAsset.get(id))
      .filter((id): id is number => id !== undefined);
    this.bulkRemoveRequest.emit({ rackUnitIds: ids, assetIds });
  }

  protected onRemoveClick(
    rackUnitId: number,
    assetId: number,
    event: MouseEvent,
  ): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const popW = 240;
    const popH = 110;
    const idealX = rect.right + 6;
    const x =
      idealX + popW > window.innerWidth - 4 ? rect.left - popW - 4 : idealX;
    const idealY = rect.top - 4;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - popH - 4));
    this.removeRequest.emit({ rackUnitId, assetId, anchorX: x, anchorY: y });
  }

  protected onStatePickerClick(deviceId: number, event: MouseEvent): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pickerW = 180;
    const pickerH = Math.min(this.availableStatesCount() * 34 + 8, 260);
    const idealX = rect.right + 6;
    const x =
      idealX + pickerW > window.innerWidth - 4
        ? rect.left - pickerW - 4
        : idealX;
    const idealY = rect.top - 4;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - pickerH - 4));
    this.statePickerRequest.emit({ deviceId, anchorX: x, anchorY: y });
  }

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
}
