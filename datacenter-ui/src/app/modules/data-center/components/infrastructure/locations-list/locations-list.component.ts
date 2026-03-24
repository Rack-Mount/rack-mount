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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
  Location,
  LocationService,
  Room,
  RoomTypeEnum,
} from '../../../../core/api/v1';
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from '../../../../core/constants';
import { BackendErrorService } from '../../../../core/services/backend-error.service';
import { RoleService } from '../../../../core/services/role.service';
import {
  PaginatedListState,
  SaveState,
} from '../../../../core/types/list-state.types';
import { toggleSort } from '../../../../core/utils/sort.utils';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

@Component({
  selector: 'app-locations-list',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './locations-list.component.html',
  styleUrl: './locations-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationsListComponent {
  private readonly svc = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly backendErr = inject(BackendErrorService);
  private readonly translate = inject(TranslateService);
  protected readonly role = inject(RoleService);

  protected readonly RoomTypeEnum = RoomTypeEnum;

  // ── Active tab ────────────────────────────────────────────────────────────
  protected readonly activeTab = signal<'locations' | 'rooms'>('locations');

  // ── Location options for room FK dropdown ─────────────────────────────────
  protected readonly locationOptions = signal<Location[]>([]);

  // ══════════════════════════════════════════════════════════════════════════
  // LOCATIONS
  // ══════════════════════════════════════════════════════════════════════════

  protected readonly locSearch = signal('');
  protected readonly locPage = signal(1);
  protected readonly locOrdering = signal('name');
  private readonly _locSearchInput = new Subject<string>();

  protected readonly locSortField = computed(() =>
    this.locOrdering().replace(/^-/, ''),
  );
  protected readonly locSortDir = computed(() =>
    this.locOrdering().startsWith('-') ? 'desc' : 'asc',
  );

  protected readonly locListState = signal<PaginatedListState<Location>>({
    status: 'loading',
  });
  protected readonly locations = computed(() => {
    const s = this.locListState();
    return s.status === 'loaded' ? s.results : [];
  });
  protected readonly locTotalCount = computed(() => {
    const s = this.locListState();
    return s.status === 'loaded' ? s.count : 0;
  });
  protected readonly locTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.locTotalCount() / PAGE_SIZE)),
  );
  protected readonly locPageNumbers = computed(() => {
    const total = this.locTotalPages();
    const cur = this.locPage();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++)
      pages.push(i);
    return pages;
  });

  // Inline create/edit/delete for locations
  protected readonly locCreateOpen = signal(false);
  protected readonly locCreateName = signal('');
  protected readonly locCreateShortName = signal('');
  protected readonly locCreateAddress = signal('');
  protected readonly locCreateSave = signal<SaveState>('idle');
  protected readonly locCreateSaveMsg = signal('');

  protected readonly locEditId = signal<number | null>(null);
  protected readonly locEditName = signal('');
  protected readonly locEditShortName = signal('');
  protected readonly locEditAddress = signal('');
  protected readonly locEditSave = signal<SaveState>('idle');
  protected readonly locEditSaveMsg = signal('');

  protected readonly locDeleteId = signal<number | null>(null);
  protected readonly locDeleteSave = signal<SaveState>('idle');
  protected readonly locDeleteErrorMsg = signal('');

  // ══════════════════════════════════════════════════════════════════════════
  // ROOMS
  // ══════════════════════════════════════════════════════════════════════════

  protected readonly roomSearch = signal('');
  protected readonly roomPage = signal(1);
  protected readonly roomOrdering = signal('name');
  protected readonly roomTypeFilter = signal<RoomTypeEnum | ''>('');
  private readonly _roomSearchInput = new Subject<string>();

  protected readonly roomSortField = computed(() =>
    this.roomOrdering().replace(/^-/, ''),
  );
  protected readonly roomSortDir = computed(() =>
    this.roomOrdering().startsWith('-') ? 'desc' : 'asc',
  );

  protected readonly roomListState = signal<PaginatedListState<Room>>({
    status: 'loading',
  });
  protected readonly rooms = computed(() => {
    const s = this.roomListState();
    return s.status === 'loaded' ? s.results : [];
  });
  protected readonly roomTotalCount = computed(() => {
    const s = this.roomListState();
    return s.status === 'loaded' ? s.count : 0;
  });
  protected readonly roomTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.roomTotalCount() / PAGE_SIZE)),
  );
  protected readonly roomPageNumbers = computed(() => {
    const total = this.roomTotalPages();
    const cur = this.roomPage();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++)
      pages.push(i);
    return pages;
  });

  // Inline create/edit/delete for rooms
  protected readonly roomCreateOpen = signal(false);
  protected readonly roomCreateName = signal('');
  protected readonly roomCreateLocUrl = signal('');
  protected readonly roomCreateFloor = signal<number | null>(null);
  protected readonly roomCreateType = signal<RoomTypeEnum | ''>('');
  protected readonly roomCreateCapacity = signal<number | null>(null);
  protected readonly roomCreateSave = signal<SaveState>('idle');
  protected readonly roomCreateSaveMsg = signal('');

  protected readonly roomEditId = signal<number | null>(null);
  protected readonly roomEditName = signal('');
  protected readonly roomEditLocUrl = signal('');
  protected readonly roomEditFloor = signal<number | null>(null);
  protected readonly roomEditType = signal<RoomTypeEnum | ''>('');
  protected readonly roomEditCapacity = signal<number | null>(null);
  protected readonly roomEditSave = signal<SaveState>('idle');
  protected readonly roomEditSaveMsg = signal('');

  protected readonly roomDeleteId = signal<number | null>(null);
  protected readonly roomDeleteSave = signal<SaveState>('idle');
  protected readonly roomDeleteErrorMsg = signal('');

  // ── Constructor ───────────────────────────────────────────────────────────
  constructor() {
    // Load all locations for room dropdown
    this.svc
      .locationLocationList({ pageSize: 1000, ordering: 'name' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.locationOptions.set(r.results ?? []));

    // Location search debounce
    this._locSearchInput
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((v) => {
        this.locSearch.set(v);
        this.locPage.set(1);
      });

    // Location list driven by params
    toObservable(
      computed(() => ({
        search: this.locSearch(),
        page: this.locPage(),
        ordering: this.locOrdering(),
      })),
    )
      .pipe(
        switchMap((p) =>
          concat(
            of<PaginatedListState<Location>>({ status: 'loading' }),
            this.svc
              .locationLocationList({
                search: p.search || undefined,
                page: p.page,
                pageSize: PAGE_SIZE,
                ordering: p.ordering,
              })
              .pipe(
                map(
                  (r): PaginatedListState<Location> => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() =>
                  of<PaginatedListState<Location>>({ status: 'error' }),
                ),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.locListState.set(s));

    // Room search debounce
    this._roomSearchInput
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((v) => {
        this.roomSearch.set(v);
        this.roomPage.set(1);
      });

    // Room list driven by params
    toObservable(
      computed(() => ({
        search: this.roomSearch(),
        page: this.roomPage(),
        ordering: this.roomOrdering(),
        roomTypeFilter: this.roomTypeFilter(),
      })),
    )
      .pipe(
        switchMap((p) =>
          concat(
            of<PaginatedListState<Room>>({ status: 'loading' }),
            this.svc
              .locationRoomList({
                search: p.search || undefined,
                page: p.page,
                pageSize: PAGE_SIZE,
                ordering: p.ordering,
                roomType: (p.roomTypeFilter as RoomTypeEnum) || undefined,
              })
              .pipe(
                map(
                  (r): PaginatedListState<Room> => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() =>
                  of<PaginatedListState<Room>>({ status: 'error' }),
                ),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.roomListState.set(s));
  }

  // ── Location helpers ──────────────────────────────────────────────────────
  protected onLocSearchInput(v: string): void {
    this._locSearchInput.next(v);
  }
  protected resetLocSearch(): void {
    this.locSearch.set('');
    this.locPage.set(1);
  }
  protected locSort(field: string): void {
    this.locOrdering.set(toggleSort(this.locOrdering(), field));
    this.locPage.set(1);
  }
  protected locGoPage(p: number): void {
    this.locPage.set(p);
  }

  protected openLocCreate(): void {
    this.locCreateName.set('');
    this.locCreateShortName.set('');
    this.locCreateAddress.set('');
    this.locCreateSave.set('idle');
    this.locCreateSaveMsg.set('');
    this.locCreateOpen.set(true);
    this.locEditId.set(null);
  }
  protected cancelLocCreate(): void {
    this.locCreateOpen.set(false);
  }
  protected submitLocCreate(): void {
    const name = this.locCreateName().trim();
    if (!name) return;
    this.locCreateSave.set('saving');
    this.svc
      .locationLocationCreate({
        location: {
          name,
          short_name: this.locCreateShortName().trim(),
          location: this.locCreateAddress().trim(),
        } as Location,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (loc) => {
          this.locCreateSave.set('idle');
          this.locCreateOpen.set(false);
          this.locListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : { ...s, results: [loc, ...s.results], count: s.count + 1 },
          );
          this.locationOptions.update((opts) =>
            [loc, ...opts].sort((a, b) => a.name.localeCompare(b.name)),
          );
        },
        error: (err: HttpErrorResponse) => {
          this.locCreateSave.set('error');
          this.locCreateSaveMsg.set(this.backendErr.parse(err));
        },
      });
  }

  protected startLocEdit(loc: Location): void {
    this.locCreateOpen.set(false);
    this.locEditId.set(loc.id);
    this.locEditName.set(loc.name);
    this.locEditShortName.set(loc.short_name ?? '');
    this.locEditAddress.set(loc.location ?? '');
    this.locEditSave.set('idle');
    this.locEditSaveMsg.set('');
  }
  protected cancelLocEdit(): void {
    this.locEditId.set(null);
  }
  protected submitLocEdit(): void {
    const id = this.locEditId();
    const name = this.locEditName().trim();
    if (!id || !name) return;
    this.locEditSave.set('saving');
    this.svc
      .locationLocationPartialUpdate({
        id,
        patchedLocation: {
          name,
          short_name: this.locEditShortName().trim(),
          location: this.locEditAddress().trim(),
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.locEditSave.set('idle');
          this.locEditId.set(null);
          this.locListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : {
                  ...s,
                  results: s.results.map((r) =>
                    r.id === updated.id ? updated : r,
                  ),
                },
          );
          this.locationOptions.update((opts) =>
            opts.map((o) => (o.id === updated.id ? updated : o)),
          );
        },
        error: (err: HttpErrorResponse) => {
          this.locEditSave.set('error');
          this.locEditSaveMsg.set(this.backendErr.parse(err));
        },
      });
  }

  protected confirmLocDelete(id: number): void {
    this.locDeleteId.set(id);
    this.locDeleteSave.set('idle');
    this.locDeleteErrorMsg.set('');
  }
  protected cancelLocDelete(): void {
    this.locDeleteId.set(null);
  }
  protected submitLocDelete(): void {
    const id = this.locDeleteId();
    if (!id) return;
    this.locDeleteSave.set('saving');
    this.svc
      .locationLocationDestroy({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.locDeleteSave.set('idle');
          this.locDeleteId.set(null);
          this.locListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : {
                  ...s,
                  results: s.results.filter((r) => r.id !== id),
                  count: Math.max(0, s.count - 1),
                },
          );
          this.locationOptions.update((opts) =>
            opts.filter((o) => o.id !== id),
          );
        },
        error: (err: HttpErrorResponse) => {
          this.locDeleteSave.set('error');
          this.locDeleteErrorMsg.set(
            err.status === 409
              ? this.translate.instant('locations.in_use')
              : this.backendErr.parse(err),
          );
        },
      });
  }

  // ── Room helpers ──────────────────────────────────────────────────────────
  protected onRoomSearchInput(v: string): void {
    this._roomSearchInput.next(v);
  }
  protected resetRoomSearch(): void {
    this.roomSearch.set('');
    this.roomPage.set(1);
  }
  protected setRoomTypeFilter(v: string): void {
    this.roomTypeFilter.set(v as RoomTypeEnum | '');
    this.roomPage.set(1);
  }
  protected roomSort(field: string): void {
    this.roomOrdering.set(toggleSort(this.roomOrdering(), field));
    this.roomPage.set(1);
  }
  protected roomGoPage(p: number): void {
    this.roomPage.set(p);
  }

  protected locationName(url: string): string {
    return this.locationOptions().find((l) => l.url === url)?.name ?? url;
  }

  protected openRoomCreate(): void {
    this.roomCreateName.set('');
    this.roomCreateLocUrl.set(this.locationOptions()[0]?.url ?? '');
    this.roomCreateFloor.set(null);
    this.roomCreateType.set('');
    this.roomCreateCapacity.set(null);
    this.roomCreateSave.set('idle');
    this.roomCreateSaveMsg.set('');
    this.roomCreateOpen.set(true);
    this.roomEditId.set(null);
  }
  protected cancelRoomCreate(): void {
    this.roomCreateOpen.set(false);
  }
  protected submitRoomCreate(): void {
    const name = this.roomCreateName().trim();
    const locUrl = this.roomCreateLocUrl();
    if (!name || !locUrl) return;
    this.roomCreateSave.set('saving');
    const payload: Partial<Room> = {
      name,
      location: locUrl,
      ...(this.roomCreateFloor() != null
        ? { floor: this.roomCreateFloor()! }
        : {}),
      ...(this.roomCreateType()
        ? { room_type: this.roomCreateType() as RoomTypeEnum }
        : {}),
      ...(this.roomCreateCapacity() != null
        ? { capacity: this.roomCreateCapacity()! }
        : {}),
    };
    this.svc
      .locationRoomCreate({ room: payload as Room })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (room) => {
          this.roomCreateSave.set('idle');
          this.roomCreateOpen.set(false);
          this.roomListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : { ...s, results: [room, ...s.results], count: s.count + 1 },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.roomCreateSave.set('error');
          this.roomCreateSaveMsg.set(this.backendErr.parse(err));
        },
      });
  }

  protected startRoomEdit(room: Room): void {
    this.roomCreateOpen.set(false);
    this.roomEditId.set(room.id);
    this.roomEditName.set(room.name);
    this.roomEditLocUrl.set(room.location);
    this.roomEditFloor.set(room.floor ?? null);
    this.roomEditType.set(room.room_type ?? '');
    this.roomEditCapacity.set(room.capacity ?? null);
    this.roomEditSave.set('idle');
    this.roomEditSaveMsg.set('');
  }
  protected cancelRoomEdit(): void {
    this.roomEditId.set(null);
  }
  protected submitRoomEdit(): void {
    const id = this.roomEditId();
    const name = this.roomEditName().trim();
    const locUrl = this.roomEditLocUrl();
    if (!id || !name || !locUrl) return;
    this.roomEditSave.set('saving');
    const payload: Partial<Room> = {
      name,
      location: locUrl,
      floor: this.roomEditFloor() ?? undefined,
      room_type: this.roomEditType()
        ? (this.roomEditType() as RoomTypeEnum)
        : undefined,
      capacity: this.roomEditCapacity() ?? undefined,
    };
    this.svc
      .locationRoomPartialUpdate({ id, patchedRoom: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.roomEditSave.set('idle');
          this.roomEditId.set(null);
          this.roomListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : {
                  ...s,
                  results: s.results.map((r) =>
                    r.id === updated.id ? updated : r,
                  ),
                },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.roomEditSave.set('error');
          this.roomEditSaveMsg.set(this.backendErr.parse(err));
        },
      });
  }

  protected confirmRoomDelete(id: number): void {
    this.roomDeleteId.set(id);
    this.roomDeleteSave.set('idle');
    this.roomDeleteErrorMsg.set('');
  }
  protected cancelRoomDelete(): void {
    this.roomDeleteId.set(null);
  }
  protected submitRoomDelete(): void {
    const id = this.roomDeleteId();
    if (!id) return;
    this.roomDeleteSave.set('saving');
    this.svc
      .locationRoomDestroy({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.roomDeleteSave.set('idle');
          this.roomDeleteId.set(null);
          this.roomListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : {
                  ...s,
                  results: s.results.filter((r) => r.id !== id),
                  count: Math.max(0, s.count - 1),
                },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.roomDeleteSave.set('error');
          this.roomDeleteErrorMsg.set(
            err.status === 409
              ? this.translate.instant('rooms.in_use')
              : this.backendErr.parse(err),
          );
        },
      });
  }
}
