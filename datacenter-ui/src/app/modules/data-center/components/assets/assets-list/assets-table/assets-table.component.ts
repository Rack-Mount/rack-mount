import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Asset, AssetState } from '../../../../../core/api/v1';
import { RoleService } from '../../../../../core/services/role.service';
import { AssetRowDetailComponent } from '../asset-row-detail/asset-row-detail.component';
import { EditState, ListState, stateColor } from '../assets-list-utils';

export interface StatePickerOpenEvent {
  assetId: number;
  x: number;
  y: number;
}

export interface BulkPickerOpenEvent {
  x: number;
  y: number;
}

@Component({
  selector: 'app-assets-table',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe, AssetRowDetailComponent],
  templateUrl: './assets-table.component.html',
  styleUrl: './assets-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsTableComponent {
  protected readonly role = inject(RoleService);

  // ── Data ──────────────────────────────────────────────────────────────────
  @Input() listState: ListState = { status: 'loading' };
  @Input() availableStates: AssetState[] = [];

  // ── Sort ──────────────────────────────────────────────────────────────────
  @Input() sortField: string | null = null;
  @Input() sortDir: 'asc' | 'desc' = 'asc';

  // ── Selection ─────────────────────────────────────────────────────────────
  @Input() selectedIds: Set<number> = new Set();
  @Input() selectAllPages = false;
  @Input() isAllSelected = false;
  @Input() isSomeSelected = false;
  @Input() canSelectAllPages = false;
  @Input() selectedCount = 0;
  @Input() totalCount = 0;
  @Input() bulkEditState: EditState = 'idle';

  // ── Expand ────────────────────────────────────────────────────────────────
  @Input() expandedId: number | null = null;

  // ── Pagination ────────────────────────────────────────────────────────────
  @Input() totalPages = 1;
  @Input() startIndex = 0;
  @Input() endIndex = 0;
  @Input() currentPage = 1;

  // ── Delete ────────────────────────────────────────────────────────────────
  @Input() deleteConfirmId: number | null = null;
  @Input() deleteSaveState: 'idle' | 'saving' | 'error' | 'mounted' = 'idle';

  // ── Clone ──────────────────────────────────────────────────────────────────
  @Input() cloneInProgressId: number | null = null;

  // ── Misc ──────────────────────────────────────────────────────────────────
  @Input() today = '';

  // ── Outputs ───────────────────────────────────────────────────────────────
  @Output() sortChange = new EventEmitter<string>();
  @Output() expandToggle = new EventEmitter<number>();
  @Output() selectAllToggle = new EventEmitter<void>();
  @Output() selectRowToggle = new EventEmitter<number>();
  @Output() selectionCleared = new EventEmitter<void>();
  @Output() allPagesSelected = new EventEmitter<void>();
  @Output() statePickerOpen = new EventEmitter<StatePickerOpenEvent>();
  @Output() editRequested = new EventEmitter<Asset>();
  @Output() deleteRequested = new EventEmitter<number>();
  @Output() deleteConfirmed = new EventEmitter<number>();
  @Output() deleteCancelled = new EventEmitter<void>();
  @Output() cloneRequested = new EventEmitter<number>();
  @Output() bulkCloneRequested = new EventEmitter<void>();
  @Output() bulkPickerOpen = new EventEmitter<BulkPickerOpenEvent>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() exportRequested = new EventEmitter<void>();
  @Output() retryLoad = new EventEmitter<void>();

  protected readonly stateColor = stateColor;
  protected readonly skeletonRows = Array.from({ length: 10 }, (_, i) => i);

  get assets(): Asset[] {
    return this.listState.status === 'loaded' ? this.listState.results : [];
  }

  protected onOpenStatePicker(assetId: number, event: MouseEvent): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pickerW = 200;
    const pickerH = Math.min(this.availableStates.length * 36 + 8, 280);
    const idealX = rect.right + 6;
    const x =
      idealX + pickerW > window.innerWidth - 4
        ? rect.left - pickerW - 4
        : idealX;
    const idealY = rect.top - 4;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - pickerH - 4));
    this.statePickerOpen.emit({ assetId, x, y });
  }

  protected onOpenBulkPicker(event: MouseEvent): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pickerW = 200;
    const pickerH = Math.min(this.availableStates.length * 36 + 8, 280);
    const idealX = rect.left;
    const x =
      idealX + pickerW > window.innerWidth - 4 ? rect.right - pickerW : idealX;
    const idealY = rect.bottom + 6;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - pickerH - 4));
    this.bulkPickerOpen.emit({ x, y });
  }

  protected onSelectRow(id: number, event: MouseEvent): void {
    event.stopPropagation();
    this.selectRowToggle.emit(id);
  }

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  }

  protected relativeDate(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return 'oggi';
    if (days === 1) return 'ieri';
    if (days < 30) return `${days}g fa`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}m fa`;
    return `${Math.floor(months / 12)}a fa`;
  }
}
