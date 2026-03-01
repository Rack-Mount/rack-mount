import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import {
  AssetService,
  Location,
  LocationService,
  Rack,
  Room,
} from '../../../../core/api/v1';
import { TabService } from '../../../../core/services/tab.service';
import { RackCreateDrawerComponent } from './rack-create-drawer/rack-create-drawer.component';
import { RacksTableComponent } from './racks-table/racks-table.component';
import { RacksToolbarComponent } from './racks-toolbar/racks-toolbar.component';
import { DeleteState, ListState } from './racks.types';

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
export class RacksListComponent implements OnInit {
  private readonly assetService = inject(AssetService);
  private readonly locationService = inject(LocationService);
  private readonly tabService = inject(TabService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly listState = signal<ListState>({ status: 'loading' });
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

  private readonly search$ = new Subject<string>();

  ngOnInit(): void {
    this.loadRacks();
    this.locationService
      .locationLocationList({ pageSize: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (data) => this.locations.set(data.results) });

    this.search$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((q) =>
          this.assetService.assetRackList({
            search: q || undefined,
            pageSize: 200,
            roomLocation: this.locationFilter() ?? undefined,
            room: this.roomFilter() ?? undefined,
            ordering: this.ordering(),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (data) =>
          this.listState.set({
            status: 'loaded',
            results: data.results,
            count: data.count,
          }),
        error: () => this.listState.set({ status: 'error' }),
      });
  }

  private loadRacks(): void {
    this.listState.set({ status: 'loading' });
    this.assetService
      .assetRackList({
        pageSize: 200,
        search: this.searchQuery() || undefined,
        roomLocation: this.locationFilter() ?? undefined,
        room: this.roomFilter() ?? undefined,
        ordering: this.ordering(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) =>
          this.listState.set({
            status: 'loaded',
            results: data.results,
            count: data.count,
          }),
        error: () => this.listState.set({ status: 'error' }),
      });
  }

  protected onSearch(q: string): void {
    this.searchQuery.set(q);
    this.search$.next(q);
  }

  protected onClearSearch(): void {
    this.onSearch('');
  }

  protected onLocationFilter(id: number | null): void {
    this.locationFilter.set(id);
    this.roomFilter.set(null); // reset room when dc changes
    this.loadRacks();
  }

  protected onRoomFilter(id: number | null): void {
    this.roomFilter.set(id);
    this.loadRacks();
  }

  protected onSort(field: string): void {
    const cur = this.ordering();
    this.ordering.set(cur === field ? `-${field}` : field);
    this.loadRacks();
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
