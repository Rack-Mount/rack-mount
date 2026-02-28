import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { AssetService, AssetState } from '../../../../core/api/v1';

@Component({
  selector: 'app-rack-state-picker',
  imports: [],
  templateUrl: './rack-state-picker.component.html',
  styleUrl: './rack-state-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackStatePickerComponent {
  private readonly assetService = inject(AssetService);

  readonly states = input.required<AssetState[]>();
  readonly anchorX = input.required<number>();
  readonly anchorY = input.required<number>();
  readonly deviceId = input.required<number>();

  readonly stateChanged = output<void>();
  readonly closed = output<void>();

  readonly _saving = signal(false);

  protected close(): void {
    this.closed.emit();
  }

  protected pickState(stateId: number): void {
    this._saving.set(true);
    this.assetService
      .assetAssetPartialUpdate({
        id: this.deviceId(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patchedAsset: { state_id: stateId } as any,
      })
      .subscribe({
        next: () => {
          this._saving.set(false);
          this.stateChanged.emit();
          this.closed.emit();
        },
        error: () => {
          this._saving.set(false);
        },
      });
  }
}
