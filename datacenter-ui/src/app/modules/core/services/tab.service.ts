import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { PanelTab } from '../../data-center/components/detail-panel/detail-panel.types';

const LS_TABS_KEY = 'dc:tabs';

@Injectable({ providedIn: 'root' })
export class TabService {
  private readonly _tabs = signal<PanelTab[]>(this.loadTabsFromStorage());

  /** Emits a tab id whenever it should become active */
  private readonly _activate$ = new Subject<string>();
  readonly activate$ = this._activate$.asObservable();

  /** Emits when a rack tab was closed due to a 404 load error */
  private readonly _rackNotFound$ = new Subject<string>();
  readonly rackNotFound$ = this._rackNotFound$.asObservable();

  /** Emits when a room tab was closed due to a 404 load error */
  private readonly _roomNotFound$ = new Subject<number>();
  readonly roomNotFound$ = this._roomNotFound$.asObservable();

  readonly tabs = this._tabs.asReadonly();

  // ── Persistence ───────────────────────────────────────────

  private loadTabsFromStorage(): PanelTab[] {
    try {
      const raw = localStorage.getItem(LS_TABS_KEY);
      // Filter out pinned tabs managed by AppComponent ('home', 'assets')
      // to avoid duplicate or closeable entries after a session restore.
      const RESERVED = new Set(['home']);
      return raw
        ? (JSON.parse(raw) as PanelTab[]).filter((t) => !RESERVED.has(t.id))
        : [];
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

  // ── Tab upsert helpers ────────────────────────────────────

  /** Adds a room tab if not already present. Returns true if newly added. */
  private upsertRoomTab(tabId: string, roomId: number, label: string): boolean {
    if (this._tabs().some((t) => t.id === tabId)) return false;
    this._tabs.update((tabs) => [
      ...tabs,
      { id: tabId, label, type: 'room', roomId, pinned: false },
    ]);
    return true;
  }

  /** Adds a rack tab if not already present. Returns true if newly added. */
  private upsertRackTab(tabId: string, rackName: string): boolean {
    if (this._tabs().some((t) => t.id === tabId)) return false;
    this._tabs.update((tabs) => [
      ...tabs,
      { id: tabId, label: rackName, type: 'rack', rackName, pinned: false },
    ]);
    return true;
  }

  // ── Room tabs ─────────────────────────────────────────────

  openRoom(roomId: number, roomName: string): void {
    const tabId = `room-${roomId}`;
    this.upsertRoomTab(tabId, roomId, roomName);
    this.persistTabs();
    this._activate$.next(tabId);
  }

  /** Creates a room tab without triggering navigation (used for direct URL restore). */
  ensureRoomTab(roomId: number, label: string): void {
    const tabId = `room-${roomId}`;
    if (this.upsertRoomTab(tabId, roomId, label)) {
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

  reportRoomNotFound(roomId: number): void {
    this.closeTab(`room-${roomId}`);
    this._roomNotFound$.next(roomId);
  }

  // ── Rack tabs ─────────────────────────────────────────────

  // ── Assets tab ─────────────────────────────────────────

  private upsertAssetsTab(): boolean {
    if (this._tabs().some((t) => t.id === 'assets')) return false;
    this._tabs.update((tabs) => [
      { id: 'assets', label: 'Asset', type: 'assets', pinned: false },
      ...tabs,
    ]);
    return true;
  }

  openAssets(): void {
    this.upsertAssetsTab();
    this.persistTabs();
    this._activate$.next('assets');
  }

  /** Restores the assets tab without triggering navigation (used for direct URL restore). */
  ensureAssetsTab(): void {
    if (this.upsertAssetsTab()) {
      this.persistTabs();
    }
  }

  reportRackNotFound(rackName: string): void {
    this.closeTab(`rack-${rackName}`);
    this._rackNotFound$.next(rackName);
  }

  openRack(rackName: string): void {
    const tabId = `rack-${rackName}`;
    this.upsertRackTab(tabId, rackName);
    this.persistTabs();
    this._activate$.next(tabId);
  }

  /** Creates a rack tab without triggering navigation (used for direct URL restore). */
  ensureRackTab(rackName: string): void {
    const tabId = `rack-${rackName}`;
    this.upsertRackTab(tabId, rackName);
    this.persistTabs();
  }

  // ── Close ─────────────────────────────────────────────────

  closeTab(tabId: string): void {
    this._tabs.update((tabs) => tabs.filter((t) => t.id !== tabId));
    this.persistTabs();
  }
  /** Moves the tab with `fromId` to the position currently occupied by `toId`. */
  reorderTabs(fromId: string, toId: string): void {
    if (fromId === toId) return;
    this._tabs.update((tabs) => {
      const from = tabs.findIndex((t) => t.id === fromId);
      const to = tabs.findIndex((t) => t.id === toId);
      if (from === -1 || to === -1) return tabs;
      const next = [...tabs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    this.persistTabs();
  }

  moveTabToEnd(fromId: string): void {
    this._tabs.update((tabs) => {
      const from = tabs.findIndex((t) => t.id === fromId);
      if (from === -1) return tabs;
      const next = [...tabs];
      const [moved] = next.splice(from, 1);
      next.push(moved);
      return next;
    });
    this.persistTabs();
  }
}
