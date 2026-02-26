import { inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AssetService, Rack } from '../api/v1';
import { PanelTab } from '../../data-center/components/detail-panel/detail-panel.types';

const LS_TABS_KEY = 'dc:tabs';

@Injectable({ providedIn: 'root' })
export class TabService {
  private readonly assetService = inject(AssetService);

  private readonly _tabs = signal<PanelTab[]>(this.loadTabsFromStorage());
  private readonly _loadingRackTabId = signal<string | null>(null);
  private readonly rackCache = new Map<string, Rack | null>();

  /** Emits a tab id whenever it should become active */
  private readonly _activate$ = new Subject<string>();
  readonly activate$ = this._activate$.asObservable();

  /** Emits a rack name whenever its tab was closed due to a load error (not found) */
  private readonly _rackNotFound$ = new Subject<string>();
  readonly rackNotFound$ = this._rackNotFound$.asObservable();

  /** Emits a room id whenever its tab was closed due to a load error (not found) */
  private readonly _roomNotFound$ = new Subject<number>();
  readonly roomNotFound$ = this._roomNotFound$.asObservable();

  reportRoomNotFound(roomId: number): void {
    this.closeTab(`room-${roomId}`);
    this._roomNotFound$.next(roomId);
  }

  readonly tabs = this._tabs.asReadonly();
  readonly loadingRackTabId = this._loadingRackTabId.asReadonly();

  // ── Persistence ──────────────────────────────────────────

  private loadTabsFromStorage(): PanelTab[] {
    try {
      const raw = localStorage.getItem(LS_TABS_KEY);
      return raw ? (JSON.parse(raw) as PanelTab[]) : [];
    } catch {
      return [];
    }
  }

  private persistTabs(): void {
    try {
      localStorage.setItem(LS_TABS_KEY, JSON.stringify(this._tabs()));
    } catch {
      // storage quota or private mode — ignore
    }
  }

  // ── Room tabs ────────────────────────────────────────────

  openRoom(roomId: number, roomName: string): void {
    const tabId = `room-${roomId}`;
    if (!this._tabs().find((t) => t.id === tabId)) {
      this._tabs.update((tabs) => [
        ...tabs,
        { id: tabId, label: roomName, type: 'room', roomId, pinned: false },
      ]);
    }
    this.persistTabs();
    this._activate$.next(tabId);
  }

  /** Creates a room tab without triggering navigation (used for direct URL restore). */
  ensureRoomTab(roomId: number, label: string): void {
    const tabId = `room-${roomId}`;
    if (!this._tabs().find((t) => t.id === tabId)) {
      this._tabs.update((tabs) => [
        ...tabs,
        { id: tabId, label, type: 'room', roomId, pinned: false },
      ]);
      this.persistTabs();
    }
  }

  /** Updates the label of an existing tab (e.g. once the real room name is known). */
  updateTabLabel(tabId: string, label: string): void {
    this._tabs.update((tabs) =>
      tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    );
    this.persistTabs();
  }

  // ── Rack tabs ────────────────────────────────────────────

  getRack(tabId: string): Rack | null | undefined {
    if (!this.rackCache.has(tabId)) return undefined;
    return this.rackCache.get(tabId) ?? null;
  }

  openRack(rackName: string): void {
    const tabId = `rack-${rackName}`;
    if (!this._tabs().find((t) => t.id === tabId)) {
      this._tabs.update((tabs) => [
        ...tabs,
        { id: tabId, label: rackName, type: 'rack', rackName, pinned: false },
      ]);
    }
    if (!this.rackCache.has(tabId)) {
      this.loadRack(tabId, rackName);
    }
    this.persistTabs();
    this._activate$.next(tabId);
  }

  /** Creates a rack tab without triggering navigation (used for direct URL restore). */
  ensureRackTab(rackName: string): void {
    const tabId = `rack-${rackName}`;
    if (!this._tabs().find((t) => t.id === tabId)) {
      this._tabs.update((tabs) => [
        ...tabs,
        { id: tabId, label: rackName, type: 'rack', rackName, pinned: false },
      ]);
      this.persistTabs();
    }
    if (!this.rackCache.has(tabId)) {
      this.loadRack(tabId, rackName);
    }
  }

  // ── Close ────────────────────────────────────────────────

  closeTab(tabId: string): void {
    this._tabs.update((tabs) => tabs.filter((t) => t.id !== tabId));
    this.rackCache.delete(tabId);
    this.persistTabs();
  }

  private loadRack(tabId: string, rackName: string): void {
    this._loadingRackTabId.set(tabId);
    this.assetService.assetRackRetrieve({ name: rackName }).subscribe({
      next: (rack) => {
        this.rackCache.set(tabId, rack);
        if (this._loadingRackTabId() === tabId)
          this._loadingRackTabId.set(null);
      },
      error: () => {
        if (this._loadingRackTabId() === tabId)
          this._loadingRackTabId.set(null);
        this.closeTab(tabId);
        this._rackNotFound$.next(rackName);
      },
    });
  }
}
