import { DecimalPipe } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import {
  catchError,
  concat,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import {
  Asset,
  AssetModel,
  AssetService,
  AssetState,
  AssetType,
} from '../../../../core/api/v1';
import { TabService } from '../../../../core/services/tab.service';
import { AssetCreateDrawerComponent } from './asset-create-drawer/asset-create-drawer.component';
import { AssetRowDetailComponent } from './asset-row-detail/asset-row-detail.component';
import { AssetStatePickerComponent } from './asset-state-picker/asset-state-picker.component';
import {
  EditState,
  ListState,
  PAGE_SIZE,
  stateColor,
} from './assets-list-utils';

@Component({
  selector: 'app-assets-list',
  standalone: true,
  imports: [
    DecimalPipe,
    TranslatePipe,
    AssetCreateDrawerComponent,
    AssetRowDetailComponent,
    AssetStatePickerComponent,
  ],
  templateUrl: './assets-list.component.html',
  styleUrl: './assets-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsListComponent {
  protected readonly assetService = inject(AssetService);
  protected readonly tabService = inject(TabService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly http = inject(HttpClient);

  // ── Filter options ────────────────────────────────────────────────────────
  protected readonly availableStates = signal<AssetState[]>([]);
  protected readonly availableTypes = signal<AssetType[]>([]);
  protected readonly availableModels = signal<AssetModel[]>([]);

  // ── Create drawer ─────────────────────────────────────────────────────────
  protected readonly createDrawerOpen = signal(false);

  // ── Delete confirmation ────────────────────────────────────────────────────
  protected readonly deleteConfirmId = signal<number | null>(null);
  protected readonly deleteSaveState = signal<
    'idle' | 'saving' | 'error' | 'mounted'
  >('idle');

  // ── Filter params (single signal for reactivity) ──────────────────────────
  protected readonly params = signal({
    search: '',
    stateId: null as number | null,
    typeId: null as number | null,
    page: 1,
    ordering: null as string | null,
  });

  // ── Sort helpers ──────────────────────────────────────────────────────────
  protected readonly sortField = computed(() => {
    const o = this.params().ordering;
    if (!o) return null;
    return o.startsWith('-') ? o.slice(1) : o;
  });

  protected readonly sortDir = computed<'asc' | 'desc'>(() =>
    this.params().ordering?.startsWith('-') ? 'desc' : 'asc',
  );

  // Debounced search subject
  private readonly _searchInput = new Subject<string>();

  // ── List state ────────────────────────────────────────────────────────────
  protected readonly listState = signal<ListState>({ status: 'loading' });

  // ── Expanded row ──────────────────────────────────────────────────────────
  protected readonly expandedId = signal<number | null>(null);

  // ── Row selection ─────────────────────────────────────────────────────────
  protected readonly selectedIds = signal<Set<number>>(new Set());
  /** When true, the bulk action targets ALL pages (not just selectedIds) */
  protected readonly selectAllPages = signal(false);

  protected readonly selectedCount = computed(() =>
    this.selectAllPages() ? this.totalCount() : this.selectedIds().size,
  );

  protected readonly isAllSelected = computed(() => {
    const assets = this.assets();
    if (!assets.length) return false;
    const sel = this.selectedIds();
    return assets.every((a) => sel.has(a.id));
  });

  protected readonly isSomeSelected = computed(
    () => !this.isAllSelected() && this.selectedIds().size > 0,
  );

  /** True when all page assets are checked but more pages exist and not yet all-pages */
  protected readonly canSelectAllPages = computed(
    () =>
      this.isAllSelected() && this.totalPages() > 1 && !this.selectAllPages(),
  );

  protected toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.selectedIds.set(new Set());
      this.selectAllPages.set(false);
    } else {
      this.selectedIds.set(new Set(this.assets().map((a) => a.id)));
      this.selectAllPages.set(false);
    }
  }

  protected toggleSelectRow(id: number, event: MouseEvent): void {
    event.stopPropagation();
    this.selectAllPages.set(false);
    this.selectedIds.update((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
    this.selectAllPages.set(false);
  }

  protected selectAcrossAllPages(): void {
    this.selectAllPages.set(true);
  }

  protected openBulkStatePicker(event: MouseEvent): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pickerW = 200;
    const pickerH = Math.min(this.availableStates().length * 36 + 8, 280);
    const idealX = rect.left;
    const x =
      idealX + pickerW > window.innerWidth - 4 ? rect.right - pickerW : idealX;
    const idealY = rect.bottom + 6;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - pickerH - 4));
    this.bulkPickerX.set(x);
    this.bulkPickerY.set(y);
    this.bulkPickerOpen.set(true);
    this.bulkEditState.set('idle');
  }

  protected closeBulkPicker(): void {
    this.bulkPickerOpen.set(false);
  }

  protected bulkPickState(stateId: number): void {
    // ── All-pages bulk update via dedicated endpoint ──────────────────────────
    if (this.selectAllPages()) {
      this.bulkEditState.set('saving');
      const p = this.params();
      let qp = new HttpParams();
      if (p.search) qp = qp.set('search', p.search);
      if (p.stateId != null) qp = qp.set('state', String(p.stateId));
      if (p.typeId != null) qp = qp.set('model__type', String(p.typeId));
      this.http
        .patch<{ updated: number }>(
          `${environment.service_url}/asset/asset/bulk_state`,
          { state_id: stateId },
          { params: qp },
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.bulkEditState.set('idle');
            this.closeBulkPicker();
            this.clearSelection();
            // Reload list by bumping params (keeps current filters/page)
            this.params.update((cur) => ({ ...cur }));
          },
          error: () => this.bulkEditState.set('error'),
        });
      return;
    }

    // ── Single-page selected IDs update ───────────────────────────────────────
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.bulkEditState.set('saving');
    forkJoin(
      ids.map((id) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.assetService.assetAssetPartialUpdate({
          id,
          patchedAsset: { state_id: stateId } as any,
        }),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedAssets) => {
          this.bulkEditState.set('idle');
          this.closeBulkPicker();
          const updatedMap = new Map(updatedAssets.map((a) => [a.id, a]));
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.map((a) =>
                updatedMap.has(a.id)
                  ? {
                      ...a,
                      state: updatedMap.get(a.id)!.state,
                      state_id: updatedMap.get(a.id)!.state_id,
                    }
                  : a,
              ),
            };
          });
          this.clearSelection();
        },
        error: () => this.bulkEditState.set('error'),
      });
  }

  // ── State picker (same UX as rack) ────────────────────────────────────────
  protected readonly statePickerAssetId = signal<number | null>(null);
  protected readonly statePickerX = signal(0);
  protected readonly statePickerY = signal(0);
  protected readonly stateEditState = signal<EditState>('idle');

  // ── Bulk action picker ────────────────────────────────────────────────────
  protected readonly bulkPickerOpen = signal(false);
  protected readonly bulkPickerX = signal(0);
  protected readonly bulkPickerY = signal(0);
  protected readonly bulkEditState = signal<EditState>('idle');

  // ── Computed helpers ──────────────────────────────────────────────────────
  protected readonly assets = computed<Asset[]>(() => {
    const s = this.listState();
    return s.status === 'loaded' ? s.results : [];
  });

  protected readonly totalCount = computed(() => {
    const s = this.listState();
    return s.status === 'loaded' ? s.count : 0;
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)),
  );

  protected readonly startIndex = computed(
    () => (this.params().page - 1) * PAGE_SIZE + 1,
  );

  protected readonly endIndex = computed(() =>
    Math.min(this.params().page * PAGE_SIZE, this.totalCount()),
  );

  protected readonly skeletonRows = Array.from({ length: 10 }, (_, i) => i);

  // ── Utility exposed to template ───────────────────────────────────────────
  protected readonly stateColor = stateColor;
  protected readonly today = new Date().toISOString().slice(0, 10);

  constructor() {
    // ── Load filter options ──────────────────────────────────────────────────
    this.assetService
      .assetAssetStateList({ pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.availableStates.set(r.results ?? []));

    this.assetService
      .assetAssetTypeList({ pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.availableTypes.set(r.results ?? []));

    this.assetService
      .assetAssetModelList({ pageSize: 500 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.availableModels.set(r.results ?? []));

    // ── Debounce search: update params, reset page ───────────────────────────
    this._searchInput
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((search) =>
        this.params.update((p) => ({ ...p, search, page: 1 })),
      );

    // ── Drive list from params observable ────────────────────────────────────
    toObservable(this.params)
      .pipe(
        switchMap((p) =>
          concat(
            of<ListState>({ status: 'loading' }),
            this.assetService
              .assetAssetList({
                search: p.search || undefined,
                state: p.stateId ?? undefined,
                modelType: p.typeId ?? undefined,
                page: p.page,
                pageSize: PAGE_SIZE,
                ordering: p.ordering ?? undefined,
              })
              .pipe(
                map(
                  (r): ListState => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() => of<ListState>({ status: 'error' })),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.listState.set(s));
  }

  // ── Filter handlers ───────────────────────────────────────────────────────

  protected onSearchInput(value: string): void {
    this._searchInput.next(value);
  }

  protected onStateFilter(id: string): void {
    this.params.update((p) => ({
      ...p,
      stateId: id ? +id : null,
      page: 1,
    }));
  }

  protected onTypeFilter(id: string): void {
    this.params.update((p) => ({
      ...p,
      typeId: id ? +id : null,
      page: 1,
    }));
  }

  protected resetFilters(): void {
    this.params.set({
      search: '',
      stateId: null,
      typeId: null,
      page: 1,
      ordering: null,
    });
  }

  // ── Sort handler ──────────────────────────────────────────────────────────

  protected sortBy(field: string): void {
    const cur = this.params().ordering;
    let next: string | null;
    if (cur === field) {
      next = '-' + field;
    } else if (cur === '-' + field) {
      next = null;
    } else {
      next = field;
    }
    this.params.update((p) => ({ ...p, ordering: next, page: 1 }));
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.params.update((p) => ({ ...p, page }));
  }

  // ── Row expand ────────────────────────────────────────────────────────────

  protected toggleExpand(id: number): void {
    this.expandedId.update((cur) => (cur === id ? null : id));
    this.statePickerAssetId.set(null);
  }

  // ── State picker ──────────────────────────────────────────────────────────

  protected openStatePicker(assetId: number, event: MouseEvent): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pickerW = 200;
    const pickerH = Math.min(this.availableStates().length * 36 + 8, 280);
    const idealX = rect.right + 6;
    const x =
      idealX + pickerW > window.innerWidth - 4
        ? rect.left - pickerW - 4
        : idealX;
    const idealY = rect.top - 4;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - pickerH - 4));
    this.statePickerX.set(x);
    this.statePickerY.set(y);
    this.statePickerAssetId.set(assetId);
    this.stateEditState.set('idle');
  }

  protected closeStatePicker(): void {
    this.statePickerAssetId.set(null);
  }

  protected pickState(stateId: number): void {
    const assetId = this.statePickerAssetId();
    if (!assetId) return;
    this.stateEditState.set('saving');
    this.assetService
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .assetAssetPartialUpdate({
        id: assetId,
        patchedAsset: { state_id: stateId } as any,
      })
      .subscribe({
        next: (updated) => {
          this.stateEditState.set('idle');
          this.closeStatePicker();
          // Update the asset in the current list without re-fetching
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.map((a) =>
                a.id === assetId
                  ? { ...a, state: updated.state, state_id: updated.state_id }
                  : a,
              ),
            };
          });
        },
        error: () => this.stateEditState.set('error'),
      });
  }

  // ── Navigate to rack ──────────────────────────────────────────────────────

  protected openRack(rackName: string, event: MouseEvent): void {
    event.stopPropagation();
    this.tabService.openRack(rackName);
  }

  // ── Create asset ──────────────────────────────────────────────────────────

  protected openCreateDrawer(): void {
    this.createDrawerOpen.set(true);
  }

  protected closeCreateDrawer(): void {
    this.createDrawerOpen.set(false);
  }

  protected onDrawerSaved(): void {
    this.closeCreateDrawer();
    this.params.update((p) => ({ ...p, page: 1 }));
  }

  // ── Delete asset ──────────────────────────────────────────────────────────

  protected requestDelete(id: number): void {
    this.deleteSaveState.set('idle');
    this.deleteConfirmId.set(id);
  }

  protected cancelDelete(): void {
    this.deleteConfirmId.set(null);
  }

  protected confirmDelete(id: number): void {
    this.deleteSaveState.set('saving');
    this.assetService
      .assetAssetDestroy({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteSaveState.set('idle');
          this.deleteConfirmId.set(null);
          this.expandedId.set(null);
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.filter((a) => a.id !== id),
              count: s.count - 1,
            };
          });
        },
        error: (err: HttpErrorResponse) => {
          this.deleteSaveState.set(err.status === 409 ? 'mounted' : 'error');
        },
      });
  }

  // ── Excel export ─────────────────────────────────────────────────────────────────
  protected exportToExcel(onlySelected = false): void {
    const p = this.params();
    const selectedSet = this.selectedIds();
    const useSelection =
      onlySelected && !this.selectAllPages() && selectedSet.size > 0;

    const query = new URLSearchParams();
    if (p.search) query.set('search', p.search);
    if (p.stateId) query.set('state', String(p.stateId));
    if (p.typeId) query.set('model__type', String(p.typeId));
    if (p.ordering) query.set('ordering', p.ordering);

    if (useSelection) {
      query.set('ids', [...selectedSet].join(','));
    }

    const url = `${environment.service_url}/asset/asset/export?${query.toString()}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  }
  // ── Format helpers ────────────────────────────────────────────────────────

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
