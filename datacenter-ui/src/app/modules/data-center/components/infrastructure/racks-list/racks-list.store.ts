import { HttpErrorResponse } from '@angular/common/http';
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
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
  AssetService,
  Location,
  LocationService,
  Rack,
  Room,
} from '../../../../core/api/v1';
import { SEARCH_DEBOUNCE_MS } from '../../../../core/constants';
import { TabService } from '../../../../core/services/tab.service';
import { PaginatedListState } from '../../../../core/types/list-state.types';
import { toggleSort } from '../../../../core/utils/sort.utils';
import { DeleteState } from './racks.types';

/**
 * Component-scoped store for RacksListComponent.
 * Must be provided via `providers: [RacksListStore]` on the component.
 */
@Injectable()
export class RacksListStore {
  private readonly assetService = inject(AssetService);
  private readonly locationService = inject(LocationService);
  private readonly tabService = inject(TabService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly listState = signal<PaginatedListState<Rack>>({ status: 'loading' });
  readonly searchQuery = signal('');
  readonly locationFilter = signal<number | null>(null);
  readonly roomFilter = signal<number | null>(null);
  readonly locations = signal<Location[]>([]);
  readonly ordering = signal<string>('name');

  readonly filteredRooms = computed<Room[]>(() => {
    const locId = this.locationFilter();
    const locs = this.locations();
    if (locId === null) return locs.flatMap((l) => l.rooms ?? []);
    return locs.find((l) => l.id === locId)?.rooms ?? [];
  });

  readonly itemCount = computed<number | null>(() => {
    const s = this.listState();
    return s.status === 'loaded' ? s.count : null;
  });

  readonly drawerMode = signal<'create' | 'edit' | null>(null);
  readonly editingRack = signal<Rack | null>(null);
  readonly deleteState = signal<DeleteState>({ id: 'none' });

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
        locationId: this.locationFilter(),
        roomId: this.roomFilter(),
        ordering: this.ordering(),
      })),
    )
      .pipe(
        switchMap((p) =>
          concat(
            of<PaginatedListState<Rack>>({ status: 'loading' }),
            this.assetService
              .assetRackList({
                search: p.search || undefined,
                pageSize: 200,
                roomLocation: p.locationId ?? undefined,
                room: p.roomId ?? undefined,
                ordering: p.ordering,
              })
              .pipe(
                map(
                  (r): PaginatedListState<Rack> => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() =>
                  of<PaginatedListState<Rack>>({ status: 'error' }),
                ),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.listState.set(s));
  }

  // ── Filter actions ──────────────────────────────────────────────────────

  onSearch(q: string): void {
    this._searchInput.next(q);
  }

  onLocationFilter(id: number | null): void {
    this.locationFilter.set(id);
    this.roomFilter.set(null);
  }

  onRoomFilter(id: number | null): void {
    this.roomFilter.set(id);
  }

  // ── Sort ────────────────────────────────────────────────────────────────

  onSort(field: string): void {
    this.ordering.set(toggleSort(this.ordering(), field));
  }

  sortDir(field: string): 'asc' | 'desc' | null {
    if (this.ordering() === field) return 'asc';
    if (this.ordering() === `-${field}`) return 'desc';
    return null;
  }

  // ── Drawer ──────────────────────────────────────────────────────────────

  onNew(): void {
    this.editingRack.set(null);
    this.drawerMode.set('create');
  }

  onEdit(rack: Rack): void {
    this.editingRack.set(rack);
    this.drawerMode.set('edit');
  }

  onDrawerSaved(rack: Rack): void {
    this.drawerMode.set(null);
    this.editingRack.set(null);
    this.listState.update((s) => {
      if (s.status !== 'loaded') return s;
      const exists = s.results.some((r) => r.id === rack.id);
      const results = exists
        ? s.results.map((r) => (r.id === rack.id ? rack : r))
        : [rack, ...s.results];
      return { ...s, results, count: exists ? s.count : s.count + 1 };
    });
  }

  onDrawerClose(): void {
    this.drawerMode.set(null);
    this.editingRack.set(null);
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  onDeleteRequest(rack: Rack): void {
    this.deleteState.set({ id: rack.id, status: 'confirming' });
  }

  onDeleteCancel(): void {
    this.deleteState.set({ id: 'none' });
  }

  onDeleteConfirm(rack: Rack): void {
    this.deleteState.set({ id: rack.id, status: 'deleting' });
    this.assetService
      .assetRackDestroy({ name: rack.name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteState.set({ id: 'none' });
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.filter((r) => r.id !== rack.id),
              count: s.count - 1,
            };
          });
        },
        error: (err: HttpErrorResponse) => {
          this.deleteState.set({
            id: rack.id,
            status: err.status === 409 ? 'conflict' : 'error',
          });
        },
      });
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  openVisualizer(rack: Rack): void {
    this.tabService.openRack(rack.name);
  }

  openPreview(rack: Rack): void {
    this.router.navigate(['/rack', rack.name]);
  }
}
