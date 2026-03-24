import { HttpErrorResponse } from '@angular/common/http';
import {
  computed,
  DestroyRef,
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
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import {
  CategoryEnum,
  Location,
  LocationService,
  Room,
  WarehouseItem,
} from '../../../core/api/v1';
import { SEARCH_DEBOUNCE_MS } from '../../../core/constants';
import { PaginatedListState } from '../../../core/types/list-state.types';
import { toggleSort } from '../../../core/utils/sort.utils';

export type DeleteState =
  | { id: 'none' }
  | { id: number; status: 'confirming' | 'deleting' | 'error' };

@Injectable()
export class WarehouseInventoryStore {
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly listState = signal<PaginatedListState<WarehouseItem>>({
    status: 'loading',
  });
  readonly searchQuery = signal('');
  readonly locationFilter = signal<number | null>(null);
  readonly warehouseFilter = signal<number | null>(null);
  readonly categoryFilter = signal<string | null>(null);
  readonly belowThresholdFilter = signal<boolean>(false);
  readonly ordering = signal<string>('category');

  readonly locations = signal<Location[]>([]);

  readonly filteredRooms = computed<Room[]>(() => {
    const locId = this.locationFilter();
    const locs = this.locations();
    const allRooms = locId === null
      ? locs.flatMap((l) => l.rooms ?? [])
      : locs.find((l) => l.id === locId)?.rooms ?? [];
    // Only warehouse-type rooms
    return allRooms.filter((r) => (r as any).room_type === 'warehouse');
  });

  readonly itemCount = computed<number | null>(() => {
    const s = this.listState();
    return s.status === 'loaded' ? s.count : null;
  });

  readonly drawerMode = signal<'create' | 'edit' | null>(null);
  readonly editingItem = signal<WarehouseItem | null>(null);
  readonly adjustingItem = signal<WarehouseItem | null>(null);
  readonly deleteState = signal<DeleteState>({ id: 'none' });

  readonly categories: { value: CategoryEnum; label: string }[] = [
    { value: CategoryEnum.Cable, label: 'warehouse.cat_cable' },
    { value: CategoryEnum.Fiber, label: 'warehouse.cat_fiber' },
    { value: CategoryEnum.SfpSwitch, label: 'warehouse.cat_sfp_switch' },
    { value: CategoryEnum.SfpServer, label: 'warehouse.cat_sfp_server' },
    { value: CategoryEnum.CableManager, label: 'warehouse.cat_cable_manager' },
    { value: CategoryEnum.Other, label: 'warehouse.cat_other' },
  ];

  private readonly _searchInput = new Subject<string>();

  constructor() {
    this.locationService
      .locationLocationList({ pageSize: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (data) => this.locations.set(data.results ?? []) });

    this._searchInput
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((q) => this.searchQuery.set(q));

    toObservable(
      computed(() => ({
        search: this.searchQuery(),
        warehouseId: this.warehouseFilter(),
        category: this.categoryFilter(),
        belowThreshold: this.belowThresholdFilter(),
        ordering: this.ordering(),
      })),
    )
      .pipe(
        switchMap((p) =>
          concat(
            of<PaginatedListState<WarehouseItem>>({ status: 'loading' }),
            this.locationService
              .locationWarehouseItemList({
                search: p.search || undefined,
                pageSize: 500,
                warehouse: p.warehouseId ?? undefined,
                category: p.category as any ?? undefined,
                belowThreshold: p.belowThreshold || undefined,
                ordering: p.ordering,
              })
              .pipe(
                map(
                  (r): PaginatedListState<WarehouseItem> => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() =>
                  of<PaginatedListState<WarehouseItem>>({ status: 'error' }),
                ),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.listState.set(s));
  }

  // ── Filter actions ────────────────────────────────────────────────────────

  onSearch(q: string): void {
    this._searchInput.next(q);
  }

  onLocationFilter(id: number | null): void {
    this.locationFilter.set(id);
    this.warehouseFilter.set(null);
  }

  onWarehouseFilter(id: number | null): void {
    this.warehouseFilter.set(id);
  }

  onCategoryFilter(cat: string | null): void {
    this.categoryFilter.set(cat);
  }

  onBelowThresholdFilter(val: boolean): void {
    this.belowThresholdFilter.set(val);
  }

  // ── Sort ──────────────────────────────────────────────────────────────────

  onSort(field: string): void {
    this.ordering.set(toggleSort(this.ordering(), field));
  }

  sortDir(field: string): 'asc' | 'desc' | null {
    if (this.ordering() === field) return 'asc';
    if (this.ordering() === `-${field}`) return 'desc';
    return null;
  }

  // ── Drawer ────────────────────────────────────────────────────────────────

  onNew(): void {
    this.editingItem.set(null);
    this.drawerMode.set('create');
  }

  onEdit(item: WarehouseItem): void {
    this.editingItem.set(item);
    this.drawerMode.set('edit');
  }

  onDrawerSaved(item: WarehouseItem): void {
    this.drawerMode.set(null);
    this.editingItem.set(null);
    this.listState.update((s) => {
      if (s.status !== 'loaded') return s;
      const exists = s.results.some((r) => r.id === item.id);
      const results = exists
        ? s.results.map((r) => (r.id === item.id ? item : r))
        : [item, ...s.results];
      return { ...s, results, count: exists ? s.count : s.count + 1 };
    });
  }

  onDrawerClose(): void {
    this.drawerMode.set(null);
    this.editingItem.set(null);
  }

  // ── Adjust dialog ─────────────────────────────────────────────────────────

  onAdjust(item: WarehouseItem): void {
    this.adjustingItem.set(item);
  }

  onAdjustSaved(item: WarehouseItem): void {
    this.adjustingItem.set(null);
    this.listState.update((s) => {
      if (s.status !== 'loaded') return s;
      return {
        ...s,
        results: s.results.map((r) => (r.id === item.id ? item : r)),
      };
    });
  }

  onAdjustClose(): void {
    this.adjustingItem.set(null);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  onDeleteRequest(item: WarehouseItem): void {
    this.deleteState.set({ id: item.id, status: 'confirming' });
  }

  onDeleteCancel(): void {
    this.deleteState.set({ id: 'none' });
  }

  onDeleteConfirm(item: WarehouseItem): void {
    this.deleteState.set({ id: item.id, status: 'deleting' });
    this.locationService
      .locationWarehouseItemDestroy({ id: item.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteState.set({ id: 'none' });
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.filter((r) => r.id !== item.id),
              count: s.count - 1,
            };
          });
        },
        error: (_err: HttpErrorResponse) => {
          this.deleteState.set({ id: item.id, status: 'error' });
        },
      });
  }
}
