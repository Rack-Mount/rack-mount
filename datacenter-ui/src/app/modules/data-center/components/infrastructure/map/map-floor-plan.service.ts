import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject, forkJoin } from 'rxjs';
import { LocationService } from '../../../../core/api/v1/api/location.service';
import { Location as DjLocation } from '../../../../core/api/v1/model/location';
import { Rack } from '../../../../core/api/v1/model/rack';
import { RackType } from '../../../../core/api/v1/model/rackType';
import { Room as DjRoom } from '../../../../core/api/v1/model/room';
import { SettingsService } from '../../../../core/services/settings.service';
import { TabService } from '../../../../core/services/tab.service';
import { MapElement, RackElement, Room } from './map.types';

/** Shape of a single room-label persisted with the floor plan. */
export interface SavedRoomLabel {
  cx: number;
  cy: number;
  name: string;
}

/**
 * Manages the data-layer concerns of the map editor:
 * - Location / room / rack-type catalogue loading
 * - Floor-plan persistence (save / autosave)
 * - Backend rack CRUD (create / rename / delete)
 * - Unplaced-rack injection
 *
 * Provided at the MapComponent level (not root), so each editor instance
 * has its own independent copy of this state.
 */
@Injectable()
export class MapFloorPlanService implements OnDestroy {
  private readonly locationService = inject(LocationService);
  private readonly tabService = inject(TabService);
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  // ── Public state as Signals ───────────────────────────────────────────────
  readonly availableLocations = signal<DjLocation[]>([]);
  readonly filteredRooms = signal<DjRoom[]>([]);
  readonly selectedLocationId = signal<number | null>(null);
  readonly selectedRoomId = signal<number | null>(null);
  readonly availableRackTypes = signal<RackType[]>([]);
  readonly selectedRackType = signal<RackType | null>(null);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  readonly doorWidth = signal<number>(100);

  /**
   * Emits after `loadLocations()` completes with the room id that should be
   * loaded next (null when there is no room in the URL / input).
   */
  readonly locationsLoaded$ = new Subject<number | null>();

  // ── Timers ────────────────────────────────────────────────────────────────
  private saveStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Computed getters ─────────────────────────────────────────────────────
  get autosave(): boolean {
    return this.settingsService.autosave();
  }

  set autosave(value: boolean) {
    this.settingsService.setAutosave(value);
  }

  get selectedLocationName(): string {
    return (
      this.availableLocations().find((l) => l.id === this.selectedLocationId())
        ?.name ?? ''
    );
  }

  get selectedRoomName(): string {
    return (
      this.filteredRooms().find((r) => r.id === this.selectedRoomId())?.name ??
      ''
    );
  }

  // ── Location & room loading ───────────────────────────────────────────────

  /**
   * Loads the full location catalogue.  When a `roomIdFromInput` is provided
   * (tab mode), it is used directly; otherwise the current URL is parsed for a
   * `/map/:id` segment.
   *
   * Emits on `locationsLoaded$` with the room id to load (or null).
   */
  loadLocations(roomIdFromInput: number | undefined): void {
    let roomIdToLoad: number | null = null;

    if (roomIdFromInput != null) {
      roomIdToLoad = roomIdFromInput;
    } else {
      const tree = this.router.parseUrl(this.router.url);
      const segments = tree.root.children['primary']?.segments ?? [];
      if (segments[0]?.path === 'map' && segments[1]?.path) {
        const parsed = +segments[1].path;
        if (!isNaN(parsed)) roomIdToLoad = parsed;
      }
    }

    this.locationService.locationLocationList({}).subscribe({
      next: (data) => {
        this.availableLocations.set(data.results ?? []);
        this.loadRackTypes();
        if (roomIdToLoad != null) {
          this.resolveRoomFromLocations(roomIdToLoad, roomIdFromInput);
        }
        this.locationsLoaded$.next(roomIdToLoad);
      },
      error: (err) => console.error('Failed to load locations', err),
    });
  }

  /**
   * Sets `selectedLocationId` and `filteredRooms` by finding which location
   * contains `roomId`.  Updates the tab label when in tab mode.
   */
  resolveRoomFromLocations(
    roomId: number,
    roomIdFromInput: number | undefined,
  ): void {
    for (const loc of this.availableLocations()) {
      const match = loc.rooms?.find((r) => r.id === roomId);
      if (match) {
        this.selectedLocationId.set(loc.id ?? null);
        this.filteredRooms.set(loc.rooms ?? []);
        if (roomIdFromInput != null && match.name) {
          this.tabService.updateTabLabel(`room-${roomId}`, match.name);
        }
        break;
      }
    }
  }

  /**
   * Selects a location and returns the filtered rooms for that location.
   * Clears the currently selected room.
   */
  selectLocation(id: number | null): void {
    this.selectedLocationId.set(id ?? null);
    this.selectedRoomId.set(null);
    if (id) {
      const loc = this.availableLocations().find((l) => l.id === id);
      this.filteredRooms.set(loc?.rooms ?? []);
    } else {
      this.filteredRooms.set([]);
    }
  }

  /**
   * Stores the selected room id, navigates to `/map/:id`, and returns an
   * Observable that resolves the room document + all racks in that room.
   */
  loadRoom(
    id: number,
  ): Observable<{ room: DjRoom; racks: { results?: Rack[] } }> {
    this.selectedRoomId.set(id);
    this.router.navigate(['/map', id]);
    return forkJoin({
      room: this.locationService.locationRoomRetrieve({ id }),
      racks: this.locationService.locationRackList({ room: id, pageSize: 200 }),
    });
  }

  /** Clears the selected room and navigates back to `/map`. */
  clearRoom(): void {
    this.selectedRoomId.set(null);
    this.router.navigate(['/map']);
  }

  /**
   * Reports a room that could not be found to the tab service (used when the
   * map is opened as a tab and the room no longer exists).
   */
  reportRoomNotFound(id: number): void {
    this.tabService.reportRoomNotFound(id);
  }

  // ── Rack types ────────────────────────────────────────────────────────────

  private loadRackTypes(): void {
    this.locationService.locationRackTypeList({ pageSize: 100 }).subscribe({
      next: (data) => {
        this.availableRackTypes.set(data.results ?? []);
        if (this.availableRackTypes().length > 0 && !this.selectedRackType()) {
          this.selectedRackType.set(this.availableRackTypes()[0]);
        }
      },
      error: (err) => console.error('Failed to load rack types', err),
    });
  }

  /**
   * Returns the SVG dimensions (cm) for the currently selected rack type.
   * Falls back to 60 × 100 when nothing is selected.
   */
  getSelectedRackDimensions(): { w: number; h: number } {
    const rt = this.selectedRackType();
    if (rt) {
      return {
        w: Math.max(10, rt.width),
        h: Math.max(10, rt.depth),
      };
    }
    return { w: 60, h: 100 };
  }

  // ── Floor-plan data helpers ───────────────────────────────────────────────

  /**
   * Parses the raw `floor_plan_data` JSON from the backend into typed
   * elements and room labels, handling both the legacy plain-array format
   * and the current `{ elements, roomLabels }` object format.
   */
  parseRoomData(raw: unknown): {
    elements: MapElement[];
    savedRoomLabels: SavedRoomLabel[];
  } {
    if (Array.isArray(raw)) {
      return { elements: raw as MapElement[], savedRoomLabels: [] };
    }
    if (raw && typeof raw === 'object' && 'elements' in raw) {
      const parsed = raw as {
        elements: MapElement[];
        roomLabels?: SavedRoomLabel[];
      };
      return {
        elements: parsed.elements ?? [],
        savedRoomLabels: parsed.roomLabels ?? [],
      };
    }
    return { elements: [], savedRoomLabels: [] };
  }

  /**
   * Merges backend racks with already-placed elements:
   * - Removes rack elements whose `rackName` no longer exists in the backend.
   * - Adds newly created backend racks (not yet on the canvas) at a default
   *   row position starting at (20, 20).
   */
  injectUnplacedRacks(
    elements: MapElement[],
    backendRacks: Rack[],
  ): MapElement[] {
    const backendNames = new Set(backendRacks.map((r) => r.name));
    const filtered = elements.filter((el) => {
      if (el.type !== 'rack') return true;
      return el.rackName != null && backendNames.has(el.rackName);
    });
    const placedNames = new Set(
      filtered
        .filter(
          (el): el is RackElement => el.type === 'rack' && el.rackName != null,
        )
        .map((el) => el.rackName!),
    );
    const unplaced = backendRacks.filter((r) => !placedNames.has(r.name));
    if (unplaced.length === 0) return filtered;

    const result = [...filtered];
    let offsetX = 20;
    for (const rack of unplaced) {
      const w = Math.max(10, rack.model.width);
      const h = Math.max(10, rack.model.depth);
      result.push({
        id: `rack-${rack.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'rack',
        x: offsetX,
        y: 20,
        width: w,
        height: h,
        rackName: rack.name,
      });
      offsetX += w + 10;
    }
    return result;
  }

  /**
   * Generates a unique rack name within the current floor plan.
   * Uses the selected rack type's model name as prefix (e.g. `APC-1`).
   */
  generateRackName(elements: MapElement[]): string {
    const prefix = this.selectedRackType()?.model ?? 'Rack';
    const existingNames = new Set(
      elements
        .filter(
          (el): el is RackElement => el.type === 'rack' && el.rackName != null,
        )
        .map((el) => el.rackName!),
    );
    let n = 1;
    while (existingNames.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  /**
   * Persists the floor plan to the backend.  Updates `saveStatus` throughout
   * and resets it to `'idle'` after 3 seconds.
   */
  saveFloorPlan(
    roomId: number,
    elements: MapElement[],
    rooms: Room[],
    onDone: () => void,
  ): void {
    this.saveStatus.set('saving');

    const roomLabels = rooms
      .filter((r) => r.name)
      .map((r) => ({ cx: r.cx, cy: r.cy, name: r.name! }));

    this.locationService
      .locationRoomPartialUpdate({
        id: roomId,
        patchedRoom: {
          floor_plan_data: { elements, roomLabels } as any,
        },
      })
      .subscribe({
        next: () => {
          this.saveStatus.set('saved');
          this.resetSaveStatusAfterDelay();
          onDone();
        },
        error: (err) => {
          console.error('Failed to save floor plan', err);
          this.saveStatus.set('error');
          this.resetSaveStatusAfterDelay();
          onDone();
        },
      });
  }

  /**
   * Debounced autosave: calls `saveFn` after a 2-second idle period.
   * Does nothing when autosave is disabled or no room is selected.
   */
  scheduleAutosave(saveFn: () => void): void {
    if (!this.autosave || this.selectedRoomId() == null) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(saveFn, 2000);
  }

  private resetSaveStatusAfterDelay(): void {
    if (this.saveStatusTimer) clearTimeout(this.saveStatusTimer);
    this.saveStatusTimer = setTimeout(() => {
      this.saveStatus.set('idle');
    }, 3000);
  }

  // ── Backend rack operations ───────────────────────────────────────────────

  createRack(
    rackName: string,
    modelId: number,
    roomId: number,
  ): Observable<unknown> {
    return this.locationService.locationRackCreate({
      rack: { name: rackName, model_id: modelId, room_id: roomId } as any,
    });
  }

  renameRack(oldName: string, newName: string): Observable<unknown> {
    return this.locationService.locationRackPartialUpdate({
      name: oldName,
      patchedRack: { name: newName },
    });
  }

  deleteRack(rackName: string): Observable<void> {
    return this.locationService.locationRackDestroy({ name: rackName });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    if (this.saveStatusTimer) clearTimeout(this.saveStatusTimer);
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.locationsLoaded$.complete();
  }
}
