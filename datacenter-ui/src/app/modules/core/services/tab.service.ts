import { inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { PanelTab } from '../../data-center/components/assets/detail-panel/detail-panel.types';
import { RoleService } from './role.service';

const LS_TABS_KEY = 'dc:tabs';

@Injectable({ providedIn: 'root' })
export class TabService {
  private readonly role = inject(RoleService);
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
    const STATIC_LABEL_KEYS: Partial<Record<string, string>> = {
      assets: 'tabs.assets',
      vendors: 'tabs.vendors',
      models: 'tabs.models',
      components: 'tabs.components',
      racks: 'tabs.racks',
    };
    try {
      const raw = localStorage.getItem(LS_TABS_KEY);
      // Filter out pinned tabs managed by AppComponent ('home', 'assets')
      // to avoid duplicate or closeable entries after a session restore.
      const RESERVED = new Set(['home']);
      return raw
        ? (JSON.parse(raw) as PanelTab[])
            .filter((t) => !RESERVED.has(t.id))
            .filter((t) => this.isTabAllowed(t))
            .map((t) =>
              STATIC_LABEL_KEYS[t.id] && !t.labelKey
                ? { ...t, labelKey: STATIC_LABEL_KEYS[t.id] }
                : t,
            )
        : [];
    } catch {
      return [];
    }
  }

  private isTabAllowed(tab: PanelTab): boolean {
    if (tab.id === 'assets') return this.role.canViewAssets();
    if (tab.id === 'vendors' || tab.id === 'models' || tab.id === 'components')
      return this.role.canViewCatalog();
    if (
      tab.id === 'racks' ||
      tab.id.startsWith('rack-') ||
      tab.id.startsWith('room-')
    )
      return this.role.canViewInfrastructure();
    if (tab.id === 'admin') return this.role.canManageUsers();
    return true;
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
    if (!this.role.canViewInfrastructure()) return;
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
      ...tabs,
      {
        id: 'assets',
        label: 'Asset',
        labelKey: 'tabs.assets',
        type: 'assets',
        pinned: false,
      },
    ]);
    return true;
  }

  openAssets(): void {
    if (!this.role.canViewAssets()) return;
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

  // ── Vendors tab ─────────────────────────────────────────

  private upsertVendorsTab(): boolean {
    if (this._tabs().some((t) => t.id === 'vendors')) return false;
    this._tabs.update((tabs) => [
      ...tabs,
      {
        id: 'vendors',
        label: 'Vendor',
        labelKey: 'tabs.vendors',
        type: 'vendors',
        pinned: false,
      },
    ]);
    return true;
  }

  openVendors(): void {
    if (!this.role.canViewCatalog()) return;
    this.upsertVendorsTab();
    this.persistTabs();
    this._activate$.next('vendors');
  }

  ensureVendorsTab(): void {
    if (this.upsertVendorsTab()) this.persistTabs();
  }

  // ── Models tab ──────────────────────────────────────────

  private upsertModelsTab(): boolean {
    if (this._tabs().some((t) => t.id === 'models')) return false;
    this._tabs.update((tabs) => [
      ...tabs,
      {
        id: 'models',
        label: 'Apparati',
        labelKey: 'tabs.models',
        type: 'models',
        pinned: false,
      },
    ]);
    return true;
  }

  openModels(): void {
    if (!this.role.canViewCatalog()) return;
    this.upsertModelsTab();
    this.persistTabs();
    this._activate$.next('models');
  }

  ensureModelsTab(): void {
    if (this.upsertModelsTab()) this.persistTabs();
  }

  // ── Racks tab ───────────────────────────────────────────

  private upsertRacksTab(): boolean {
    if (this._tabs().some((t) => t.id === 'racks')) return false;
    this._tabs.update((tabs) => [
      ...tabs,
      {
        id: 'racks',
        label: 'Rack',
        labelKey: 'tabs.racks',
        type: 'racks',
        pinned: false,
      },
    ]);
    return true;
  }

  openRacks(): void {
    if (!this.role.canViewInfrastructure()) return;
    this.upsertRacksTab();
    this.persistTabs();
    this._activate$.next('racks');
  }

  ensureRacksTab(): void {
    if (this.upsertRacksTab()) this.persistTabs();
  }

  // ── Components tab ──────────────────────────────────────

  private upsertComponentsTab(): boolean {
    if (this._tabs().some((t) => t.id === 'components')) return false;
    this._tabs.update((tabs) => [
      ...tabs,
      {
        id: 'components',
        label: 'Componenti',
        labelKey: 'tabs.components',
        type: 'components',
        pinned: false,
      },
    ]);
    return true;
  }

  openComponents(): void {
    if (!this.role.canViewCatalog()) return;
    this.upsertComponentsTab();
    this.persistTabs();
    this._activate$.next('components');
  }

  ensureComponentsTab(): void {
    if (this.upsertComponentsTab()) this.persistTabs();
  }

  // ── Admin tab ────────────────────────────────────────────

  private upsertAdminTab(): boolean {
    if (this._tabs().some((t) => t.id === 'admin')) return false;
    this._tabs.update((tabs) => [
      ...tabs,
      {
        id: 'admin',
        label: 'Users',
        labelKey: 'tabs.admin',
        type: 'admin' as const,
        pinned: false,
      },
    ]);
    return true;
  }

  openAdmin(): void {
    this.upsertAdminTab();
    this.persistTabs();
    this._activate$.next('admin');
  }

  ensureAdminTab(): void {
    if (this.upsertAdminTab()) this.persistTabs();
  }

  // ── Change password tab ────────────────────────────────────

  private upsertChangePasswordTab(): boolean {
    if (this._tabs().some((t) => t.id === 'change-password')) return false;
    this._tabs.update((tabs) => [
      ...tabs,
      {
        id: 'change-password',
        label: 'Password',
        labelKey: 'tabs.change_password',
        type: 'change-password' as const,
        pinned: false,
      },
    ]);
    return true;
  }

  openChangePassword(): void {
    this.upsertChangePasswordTab();
    this.persistTabs();
    this._activate$.next('change-password');
  }

  ensureChangePasswordTab(): void {
    if (this.upsertChangePasswordTab()) this.persistTabs();
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

  /** Removes any tab the current user no longer has permission to see. */
  purgeForbiddenTabs(): void {
    this._tabs.update((tabs) => tabs.filter((t) => this.isTabAllowed(t)));
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
