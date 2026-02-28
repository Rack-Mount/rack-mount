import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Asset } from '../../../../../core/api/v1';

@Component({
  selector: 'app-asset-row-detail',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './asset-row-detail.component.html',
  styleUrl: './asset-row-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetRowDetailComponent {
  readonly asset = input.required<Asset>();
  readonly today = input.required<string>();
  readonly deleteConfirmId = input<number | null>(null);
  readonly deleteSaveState = input<'idle' | 'saving' | 'error'>('idle');

  readonly deleteRequested = output<number>();
  readonly deleteConfirmed = output<number>();
  readonly deleteCancelled = output<void>();

  protected onDeleteRequest(id: number, event: MouseEvent): void {
    event.stopPropagation();
    this.deleteRequested.emit(id);
  }

  protected onDeleteConfirm(id: number, event: MouseEvent): void {
    event.stopPropagation();
    this.deleteConfirmed.emit(id);
  }

  protected onDeleteCancel(event: MouseEvent): void {
    event.stopPropagation();
    this.deleteCancelled.emit();
  }

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  }
}
