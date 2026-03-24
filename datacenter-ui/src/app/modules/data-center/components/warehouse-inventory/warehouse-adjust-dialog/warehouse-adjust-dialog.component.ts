import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { LocationService, WarehouseItem } from '../../../../core/api/v1';

@Component({
  selector: 'app-warehouse-adjust-dialog',
  standalone: true,
  imports: [TranslatePipe, FormsModule],
  templateUrl: './warehouse-adjust-dialog.component.html',
  styleUrl: './warehouse-adjust-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarehouseAdjustDialogComponent {
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly item = input.required<WarehouseItem>();

  readonly saved = output<WarehouseItem>();
  readonly cancelled = output<void>();

  protected readonly deltaRaw = signal('');
  protected readonly notes = signal('');
  protected readonly saveState = signal<'idle' | 'saving' | 'error'>('idle');
  protected readonly saveMsg = signal('');

  protected setDelta(val: string): void {
    this.deltaRaw.set(val);
  }

  protected setNotes(val: string): void {
    this.notes.set(val);
  }

  protected onSubmit(): void {
    const raw = this.deltaRaw().trim();
    if (!raw || isNaN(Number(raw))) {
      this.saveState.set('error');
      this.saveMsg.set('warehouse.adjust_delta_invalid');
      return;
    }

    this.saveState.set('saving');
    this.saveMsg.set('');

    this.locationService
      .locationWarehouseItemAdjustCreate({
        id: this.item().id,
        warehouseItem: { delta: raw, notes: this.notes() } as any,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.saveState.set('idle');
          this.saved.emit(result as WarehouseItem);
        },
        error: (err: HttpErrorResponse) => {
          this.saveState.set('error');
          const detail =
            err.error?.delta?.[0] ??
            err.error?.detail ??
            'warehouse.adjust_error';
          this.saveMsg.set(detail);
        },
      });
  }
}
