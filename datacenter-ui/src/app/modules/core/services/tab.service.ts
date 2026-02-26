import { inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AssetService, Rack } from '../api/v1';
import { PanelTab } from '../../data-center/components/detail-panel/detail-panel.types';

@Injectable({ providedIn: 'root' })
export class TabService {
  private readonly assetService = inject(AssetService);

  private readonly _tabs = signal<PanelTab[]>([]);
  private readonly _loadingRackTabId = signal<string | null>(null);
  private readonly rackCache = new Map<string, Rack | null>();

  /** Emits a tab id whenever it should become active */
  private readonly _activate$ = new Subject<string>();
  readonly activate$ = this._activate$.asObservable();

  readonly tabs = this._tabs.asReadonly();
  readonly loadingRackTabId = this._loadingRackTabId.asReadonly();

  // ── Room tabs ────────────────────────────────────────────

  openRoom(roomId: number, roomName: string): void {
    const tabId = `room-${roomId}`;
    if (!this._tabs().find((t) => t.id === tabId)) {
      this._tabs.update((tabs) => [
        ...tabs,
        { id: tabId, label: roomName, type: 'room', roomId, pinned: false },
      ]);
    }
    this._activate$.next(tabId);
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
    this._activate$.next(tabId);
  }

  // ── Close ────────────────────────────────────────────────

  closeTab(tabId: string): void {
    this._tabs.update((tabs) => tabs.filter((t) => t.id !== tabId));
    this.rackCache.delete(tabId);
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
        this.rackCache.set(tabId, null);
        if (this._loadingRackTabId() === tabId)
          this._loadingRackTabId.set(null);
      },
    });
  }
}
