import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { AssetService } from '../../../../../core/api/v1';

@Component({
  selector: 'app-rack-remove-confirm',
  imports: [],
  templateUrl: './rack-remove-confirm.component.html',
  styleUrl: './rack-remove-confirm.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackRemoveConfirmComponent {
  private readonly assetService = inject(AssetService);

  /** Which overlay to render: single-row popover or bulk modal. */
  readonly mode = input.required<'single' | 'bulk'>();

  // ── Single-remove inputs ─────────────────────────────────────────────────
  readonly rackUnitId = input<number>(0);
  readonly assetId = input<number | null>(null);
  readonly anchorX = input<number>(0);
  readonly anchorY = input<number>(0);

  // ── Bulk-remove inputs ───────────────────────────────────────────────────
  readonly bulkRackUnitIds = input<number[]>([]);
  readonly bulkAssetIds = input<number[]>([]);
  readonly selectedCount = input<number>(0);

  // ── Shared ───────────────────────────────────────────────────────────────
  readonly decommissionedStateId = input<number | null>(null);

  readonly confirmed = output<void>();
  readonly closed = output<void>();

  readonly _saving = signal(false);

  protected close(): void {
    this.closed.emit();
  }

  protected executeSingleRemove(): void {
    const id = this.rackUnitId();
    const assetId = this.assetId();
    const stateId = this.decommissionedStateId();
    if (!id) return;
    this._saving.set(true);

    const destroy$ = this.assetService.assetRackUnitDestroy({ id });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch$ =
      assetId && stateId
        ? this.assetService.assetAssetPartialUpdate({
            id: assetId,
            patchedAsset: { state_id: stateId } as any,
          })
        : of(null);

    forkJoin([destroy$, patch$]).subscribe({
      next: () => {
        this._saving.set(false);
        this.confirmed.emit();
        this.closed.emit();
      },
      error: () => {
        this._saving.set(false);
      },
    });
  }

  protected executeBulkRemove(): void {
    const ids = this.bulkRackUnitIds();
    const assetIds = this.bulkAssetIds();
    const stateId = this.decommissionedStateId();
    if (!ids.length) return;
    this._saving.set(true);

    const destroys = ids.map((id) =>
      this.assetService.assetRackUnitDestroy({ id }),
    );
    const patches = stateId
      ? assetIds.map((assetId) =>
          this.assetService.assetAssetPartialUpdate({
            id: assetId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            patchedAsset: { state_id: stateId } as any,
          }),
        )
      : [];

    forkJoin([...destroys, ...patches]).subscribe({
      next: () => {
        this._saving.set(false);
        this.confirmed.emit();
        this.closed.emit();
      },
      error: () => {
        this._saving.set(false);
      },
    });
  }
}
