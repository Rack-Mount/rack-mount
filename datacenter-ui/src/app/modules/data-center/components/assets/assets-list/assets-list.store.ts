import { HttpErrorResponse } from '@angular/common/http';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
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
  AssetService,
  AssetState,
  AssetType,
  PatchedAsset,
} from '../../../../core/api/v1';
import { AssetActionsService } from '../../../../core/services/asset-actions.service';
import {
  BulkPickerOpenEvent,
  EditState,
  ListState,
  PAGE_SIZE,
  StatePickerOpenEvent,
} from './assets-list-utils';
import type { CsvImportState } from './assets-toolbar/assets-toolbar.component';

/**
 * Component-scoped store for AssetsListComponent.
 * Must be provided via `providers: [AssetsListStore]` on the component.
 */
@Injectable()
export class AssetsListStore {
  private readonly assetService = inject(AssetService);
  private readonly assetActionsSvc = inject(AssetActionsService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Filter options ────────────────────────────────────────────────────────
  readonly availableStates = signal<AssetState[]>([]);
  readonly availableTypes = signal<AssetType[]>([]);

  // ── Drawers ───────────────────────────────────────────────────────────────
  readonly createDrawerOpen = signal(false);
  readonly editingAsset = signal<Asset | null>(null);

  // ── CSV import ────────────────────────────────────────────────────────────
  readonly importCsvState = signal<CsvImportState>('idle');
  readonly importCsvSummary = signal('');
  readonly importCsvErrors = signal<{ row: number; message: string }[]>([]);
  readonly importCsvRows = signal<
    { row: number; hostname: string; serial_number: string }[]
  >([]);

  // ── Delete ────────────────────────────────────────────────────────────────
  readonly deleteConfirmId = signal<number | null>(null);
  readonly deleteSaveState = signal<'idle' | 'saving' | 'error' | 'mounted'>(
    'idle',
  );

  // ── Clone ─────────────────────────────────────────────────────────────────
  readonly cloneInProgressId = signal<number | null>(null);
  readonly bulkCloneState = signal<'idle' | 'saving'>('idle');

  // ── Bulk delete ───────────────────────────────────────────────────────────
  readonly bulkDeleteState = signal<'idle' | 'confirm' | 'saving' | 'error'>(
    'idle',
  );

  // ── Filter params ─────────────────────────────────────────────────────────
  private static readonly SS_KEY = 'dc:assets-params';

  private static loadParams() {
    try {
      const raw = sessionStorage.getItem(AssetsListStore.SS_KEY);
      if (raw) return JSON.parse(raw) as { search: string; stateId: number | null; typeId: number | null; page: number; ordering: string | null };
    } catch { /* ignore */ }
    return null;
  }

  readonly params = signal(
    AssetsListStore.loadParams() ?? {
      search: '',
      stateId: null as number | null,
      typeId: null as number | null,
      page: 1,
      ordering: null as string | null,
    },
  );

  readonly sortField = computed(() => {
    const o = this.params().ordering;
    return o ? (o.startsWith('-') ? o.slice(1) : o) : null;
  });

  readonly sortDir = computed<'asc' | 'desc'>(() =>
    this.params().ordering?.startsWith('-') ? 'desc' : 'asc',
  );

  readonly filterParams = computed(() => ({
    search: this.params().search,
    stateId: this.params().stateId,
    typeId: this.params().typeId,
  }));

  // ── List state ────────────────────────────────────────────────────────────
  readonly listState = signal<ListState>({ status: 'loading' });

  readonly assets = computed<Asset[]>(() => {
    const s = this.listState();
    return s.status === 'loaded' ? s.results : [];
  });

  readonly totalCount = computed(() => {
    const s = this.listState();
    return s.status === 'loaded' ? s.count : 0;
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)),
  );

  readonly startIndex = computed(
    () => (this.params().page - 1) * PAGE_SIZE + 1,
  );

  readonly endIndex = computed(() =>
    Math.min(this.params().page * PAGE_SIZE, this.totalCount()),
  );

  // ── Expand ────────────────────────────────────────────────────────────────
  readonly expandedId = signal<number | null>(null);

  // ── Selection ─────────────────────────────────────────────────────────────
  readonly selectedIds = signal<Set<number>>(new Set());
  readonly selectAllPages = signal(false);

  readonly selectedCount = computed(() =>
    this.selectAllPages() ? this.totalCount() : this.selectedIds().size,
  );

  readonly isAllSelected = computed(() => {
    const assets = this.assets();
    if (!assets.length) return false;
    const sel = this.selectedIds();
    return assets.every((a) => sel.has(a.id));
  });

  readonly isSomeSelected = computed(
    () => !this.isAllSelected() && this.selectedIds().size > 0,
  );

  readonly canSelectAllPages = computed(
    () =>
      this.isAllSelected() && this.totalPages() > 1 && !this.selectAllPages(),
  );

  // ── State picker ──────────────────────────────────────────────────────────
  readonly statePickerAssetId = signal<number | null>(null);
  readonly statePickerX = signal(0);
  readonly statePickerY = signal(0);
  readonly stateEditState = signal<EditState>('idle');

  // ── Bulk picker ───────────────────────────────────────────────────────────
  readonly bulkPickerOpen = signal(false);
  readonly bulkPickerX = signal(0);
  readonly bulkPickerY = signal(0);
  readonly bulkEditState = signal<EditState>('idle');

  // ── Misc ──────────────────────────────────────────────────────────────────
  readonly today = new Date().toISOString().slice(0, 10);

  private readonly _searchInput = new Subject<string>();

  constructor() {
    // Persist params to sessionStorage so they survive tab switches
    effect(() => {
      try {
        sessionStorage.setItem(AssetsListStore.SS_KEY, JSON.stringify(this.params()));
      } catch { /* ignore */ }
    });

    // Load filter options
    this.assetService
      .assetAssetStateList({ pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.availableStates.set(r.results ?? []));

    this.assetService
      .assetAssetTypeList({ pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.availableTypes.set(r.results ?? []));

    // Debounce search
    this._searchInput
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((search) =>
        this.params.update((p) => ({ ...p, search, page: 1 })),
      );

    // Drive list loading from params
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

  // ── Filter actions ────────────────────────────────────────────────────────

  onSearchInput(value: string): void {
    this._searchInput.next(value);
  }

  onStateFilter(id: number | null): void {
    this.params.update((p) => ({ ...p, stateId: id, page: 1 }));
  }

  onTypeFilter(id: number | null): void {
    this.params.update((p) => ({ ...p, typeId: id, page: 1 }));
  }

  resetFilters(): void {
    this.params.set({
      search: '',
      stateId: null,
      typeId: null,
      page: 1,
      ordering: null,
    });
  }

  sortBy(field: string): void {
    const cur = this.params().ordering;
    let next: string | null;
    if (cur === field) next = '-' + field;
    else if (cur === '-' + field) next = null;
    else next = field;
    this.params.update((p) => ({ ...p, ordering: next, page: 1 }));
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.params.update((p) => ({ ...p, page }));
  }

  // ── Selection actions ─────────────────────────────────────────────────────

  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.selectedIds.set(new Set());
      this.selectAllPages.set(false);
    } else {
      this.selectedIds.set(new Set(this.assets().map((a) => a.id)));
      this.selectAllPages.set(false);
    }
  }

  toggleSelectRow(id: number): void {
    this.selectAllPages.set(false);
    this.selectedIds.update((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
    this.selectAllPages.set(false);
  }

  selectAcrossAllPages(): void {
    this.selectAllPages.set(true);
  }

  // ── Expand ────────────────────────────────────────────────────────────────

  toggleExpand(id: number): void {
    this.expandedId.update((cur) => (cur === id ? null : id));
    this.statePickerAssetId.set(null);
  }

  // ── State picker ──────────────────────────────────────────────────────────

  onStatePickerOpen(e: StatePickerOpenEvent): void {
    this.statePickerX.set(e.x);
    this.statePickerY.set(e.y);
    this.statePickerAssetId.set(e.assetId);
    this.stateEditState.set('idle');
  }

  closeStatePicker(): void {
    this.statePickerAssetId.set(null);
  }

  pickState(stateId: number): void {
    const assetId = this.statePickerAssetId();
    if (!assetId) return;
    this.stateEditState.set('saving');
    this.assetService
      .assetAssetPartialUpdate({
        id: assetId,
        patchedAsset: { state_id: stateId } satisfies PatchedAsset,
      })
      .subscribe({
        next: (updated) => {
          this.stateEditState.set('idle');
          this.closeStatePicker();
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

  // ── Bulk picker ───────────────────────────────────────────────────────────

  onBulkPickerOpen(e: BulkPickerOpenEvent): void {
    this.bulkPickerX.set(e.x);
    this.bulkPickerY.set(e.y);
    this.bulkPickerOpen.set(true);
    this.bulkEditState.set('idle');
  }

  closeBulkPicker(): void {
    this.bulkPickerOpen.set(false);
  }

  bulkPickState(stateId: number): void {
    if (this.selectAllPages()) {
      this.bulkEditState.set('saving');
      const p = this.params();
      this.assetActionsSvc
        .bulkState(stateId, {
          search: p.search || undefined,
          stateId: p.stateId,
          typeId: p.typeId,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.bulkEditState.set('idle');
            this.closeBulkPicker();
            this.clearSelection();
            this.params.update((cur) => ({ ...cur }));
          },
          error: () => this.bulkEditState.set('error'),
        });
      return;
    }

    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.bulkEditState.set('saving');
    forkJoin(
      ids.map((id) =>
        this.assetService.assetAssetPartialUpdate({
          id,
          patchedAsset: { state_id: stateId } satisfies PatchedAsset,
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

  // ── Delete ────────────────────────────────────────────────────────────────

  requestDelete(id: number): void {
    this.deleteSaveState.set('idle');
    this.deleteConfirmId.set(id);
  }

  cancelDelete(): void {
    this.deleteConfirmId.set(null);
  }

  confirmDelete(id: number): void {
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

  // ── Bulk delete ───────────────────────────────────────────────────────────

  onBulkDeleteClicked(): void {
    this.bulkDeleteState.set('confirm');
  }

  onBulkDeleteCancelled(): void {
    this.bulkDeleteState.set('idle');
  }

  onBulkDeleteConfirmed(): void {
    this.bulkDeleteState.set('saving');
    const p = this.params();
    const obs = this.selectAllPages()
      ? this.assetActionsSvc.bulkDelete({
          allPages: true,
          search: p.search || undefined,
          stateId: p.stateId,
          typeId: p.typeId,
        })
      : this.assetActionsSvc.bulkDelete({ ids: [...this.selectedIds()] });

    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.bulkDeleteState.set('idle');
        this.clearSelection();
        this.params.update((cur) => ({ ...cur, page: 1 }));
      },
      error: () => this.bulkDeleteState.set('error'),
    });
  }

  // ── Clone ─────────────────────────────────────────────────────────────────

  cloneAsset(id: number): void {
    if (this.cloneInProgressId() !== null) return;
    this.cloneInProgressId.set(id);
    this.assetActionsSvc
      .clone(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cloned) => {
          this.cloneInProgressId.set(null);
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: [cloned, ...s.results],
              count: s.count + 1,
            };
          });
        },
        error: () => this.cloneInProgressId.set(null),
      });
  }

  bulkCloneSelected(): void {
    if (this.bulkCloneState() === 'saving') return;
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.bulkCloneState.set('saving');
    this.assetActionsSvc
      .bulkClone(ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.bulkCloneState.set('idle');
          this.clearSelection();
          this.params.update((p) => ({ ...p, page: 1 }));
        },
        error: () => this.bulkCloneState.set('idle'),
      });
  }

  // ── Drawers ───────────────────────────────────────────────────────────────

  openCreateDrawer(): void {
    this.createDrawerOpen.set(true);
  }

  closeCreateDrawer(): void {
    this.createDrawerOpen.set(false);
  }

  openEditDrawer(asset: Asset): void {
    this.editingAsset.set(asset);
  }

  closeEditDrawer(): void {
    this.editingAsset.set(null);
  }

  onDrawerSaved(): void {
    this.closeCreateDrawer();
    this.params.update((p) => ({ ...p, page: 1 }));
  }

  onEditSaved(): void {
    this.closeEditDrawer();
    this.params.update((p) => ({ ...p }));
  }

  // ── CSV import ────────────────────────────────────────────────────────────

  onImportCsvFile(file: File): void {
    this.importCsvState.set('importing');
    this.assetActionsSvc
      .importCsv(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.importCsvErrors.set(r.errors);
          this.importCsvRows.set(r.rows ?? []);
          const msg =
            r.errors.length > 0
              ? `${r.created} importati, ${r.errors.length} errori`
              : `${r.created} asset importati`;
          this.importCsvSummary.set(msg);
          this.importCsvState.set(r.errors.length > 0 ? 'error' : 'success');
          if (r.created > 0) {
            this.params.update((p) => ({ ...p, page: 1 }));
          }
        },
        error: () => {
          this.importCsvSummary.set("Errore durante l'importazione");
          this.importCsvState.set('error');
        },
      });
  }

  onImportCsvDismiss(): void {
    this.importCsvState.set('idle');
    this.importCsvErrors.set([]);
    this.importCsvRows.set([]);
    this.importCsvSummary.set('');
  }

  // ── Excel export ──────────────────────────────────────────────────────────

  exportToExcel(onlySelected = false): void {
    const p = this.params();
    const selectedSet = this.selectedIds();
    const useSelection =
      onlySelected && !this.selectAllPages() && selectedSet.size > 0;

    const query = new URLSearchParams();
    if (p.search) query.set('search', p.search);
    if (p.stateId) query.set('state', String(p.stateId));
    if (p.typeId) query.set('model__type', String(p.typeId));
    if (p.ordering) query.set('ordering', p.ordering);
    if (useSelection) query.set('ids', [...selectedSet].join(','));

    const url = `${environment.service_url}/asset/asset/export?${query.toString()}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  }
}
