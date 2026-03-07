import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
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
import { RackCreateDrawerComponent } from './rack-create-drawer/rack-create-drawer.component';
import { RacksTableComponent } from './racks-table/racks-table.component';
import { RacksToolbarComponent } from './racks-toolbar/racks-toolbar.component';
import { DeleteState } from './racks.types';

@Component({
  selector: 'app-racks-list',
  standalone: true,
  imports: [
    RacksToolbarComponent,
    RacksTableComponent,
    RackCreateDrawerComponent,
  ],
  templateUrl: './racks-list.component.html',
  styleUrl: './racks-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RacksListComponent {
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

  readonly drawerMode = signal<'create' | 'edit' | null>(null);
  readonly editingRack = signal<Rack | null>(null);
  readonly deleteState = signal<DeleteState>({ id: 'none' });

  private readonly _searchInput = new Subject<string>();

  constructor() {
    // Load all locations once
    this.locationService
      .locationLocationList({ pageSize: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (data) => this.locations.set(data.results ?? []) });

    // Debounce search input → update signal
    this._searchInput
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((q) => this.searchQuery.set(q));

    // Reactively reload racks whenever any filter signal changes
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

  protected onSearch(q: string): void {
    this._searchInput.next(q);
  }

  protected onClearSearch(): void {
    this._searchInput.next('');
  }

  protected onLocationFilter(id: number | null): void {
    this.locationFilter.set(id);
    this.roomFilter.set(null);
  }

  protected onRoomFilter(id: number | null): void {
    this.roomFilter.set(id);
  }

  protected onSort(field: string): void {
    this.ordering.set(toggleSort(this.ordering(), field));
  }

  protected onNew(): void {
    this.editingRack.set(null);
    this.drawerMode.set('create');
  }

  protected onEdit(rack: Rack): void {
    this.editingRack.set(rack);
    this.drawerMode.set('edit');
  }

  protected onDrawerSaved(rack: Rack): void {
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

  protected onDrawerClose(): void {
    this.drawerMode.set(null);
    this.editingRack.set(null);
  }

  protected onDeleteRequest(rack: Rack): void {
    this.deleteState.set({ id: rack.id, status: 'confirming' });
  }

  protected onDeleteCancel(): void {
    this.deleteState.set({ id: 'none' });
  }

  protected onDeleteConfirm(rack: Rack): void {
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

  protected onOpenVisualizer(rack: Rack): void {
    this.tabService.openRack(rack.name);
  }

  protected onOpenPreview(rack: Rack): void {
    this.router.navigate(['/rack', rack.name]);
  }
}
