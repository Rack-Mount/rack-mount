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
      models: 'tabs.models',
      racks: 'tabs.racks',
      options: 'tabs.options',
      'asset-settings': 'tabs.asset_settings',
      warehouse: 'tabs.warehouse',
    };
    try {
      const raw = localStorage.getItem(LS_TABS_KEY);
      const RESERVED = new Set(['home']);
      return raw
        ? (JSON.parse(raw) as PanelTab[])
            .filter((t) => !RESERVED.has(t.id))
            // Migrate old change-password tab to options
            .map((t) =>
              t.id === 'change-password'
                ? {
                    ...t,
                    id: 'options',
                    label: 'Options',
                    labelKey: 'tabs.options',
                    type: 'options' as const,
                  }
                : t,
            )
            .filter((t) => this.isTabAllowed(t))
            .map((t) =>
              STATIC_LABEL_KEYS[t.id]
                ? { ...t, labelKey: STATIC_LABEL_KEYS[t.id] }
                : t,
            )
        : [];
    } catch {
      return [];
    }
  }

  private isTabAllowed(tab: PanelTab): boolean {
    switch (tab.type) {
      case 'assets':
      case 'asset':
        return this.role.canViewAssets();
      case 'vendors':
      case 'components':
        return false;
      case 'models':
        return this.role.canViewCatalog();
      case 'racks':
      case 'rack':
      case 'room':
        return this.role.canViewInfrastructure();
      case 'rack-models':
      case 'locations':
        return false;
      case 'warehouse':
        return this.role.canViewInfrastructure();
      case 'asset-settings':
        return (
          this.role.canViewInfrastructure() ||
          this.role.isAdmin() ||
          this.role.canViewCatalog()
        );
      case 'admin':
        return this.role.canManageUsers();
      default:
        return true;
    }
  }

  private persistTabs(): void {
    try {
      localStorage.setItem(LS_TABS_KEY, JSON.stringify(this._tabs()));
    } catch {
      // storage quota or private mode — ignore
    }
  }

  // ── Generic core ──────────────────────────────────────────

  /**
   * Adds `tab` if no tab with the same `id` already exists.
   * Returns `true` when a new tab was inserted.
   */
  upsertTab(tab: PanelTab): boolean {
    if (this._tabs().some((t) => t.id === tab.id)) return false;
    this._tabs.update((tabs) => [...tabs, tab]);
    return true;
  }

  /**
   * Upserts a tab, persists, and activates it — optionally guarded by a
   * permission check. Pass `allowed: false` to silently skip the open.
   */
  openTab(tab: PanelTab, allowed = true): void {
    if (!allowed) return;
    this.upsertTab(tab);
    this.persistTabs();
    this._activate$.next(tab.id);
  }

  /**
   * Upserts a tab and persists it without activating (used for session restore).
   */
  ensureTab(tab: PanelTab): void {
    if (this.upsertTab(tab)) this.persistTabs();
  }

  // ── Typed helpers ─────────────────────────────────────────

  openRoom(roomId: number, roomName: string): void {
    this.openTab(
      {
        id: `room-${roomId}`,
        label: roomName,
        type: 'room',
        roomId,
        pinned: false,
      },
      this.role.canViewInfrastructure(),
    );
  }

  ensureRoomTab(roomId: number, label: string): void {
    this.ensureTab({
      id: `room-${roomId}`,
      label,
      type: 'room',
      roomId,
      pinned: false,
    });
  }

  openRack(rackName: string): void {
    this.openTab({
      id: `rack-${rackName}`,
      label: rackName,
      type: 'rack',
      rackName,
      pinned: false,
    });
  }

  ensureRackTab(rackName: string): void {
    this.ensureTab({
      id: `rack-${rackName}`,
      label: rackName,
      type: 'rack',
      rackName,
      pinned: false,
    });
  }

  openAssets(): void {
    this.openTab(
      {
        id: 'assets',
        label: 'Asset',
        labelKey: 'tabs.assets',
        type: 'assets',
        pinned: false,
      },
      this.role.canViewAssets(),
    );
  }

  ensureAssetsTab(): void {
    this.ensureTab({
      id: 'assets',
      label: 'Asset',
      labelKey: 'tabs.assets',
      type: 'assets',
      pinned: false,
    });
  }

  openVendors(): void {
    this.openAssetSettings();
  }

  ensureVendorsTab(): void {
    this.ensureAssetSettingsTab();
  }

  openModels(): void {
    this.openTab(
      {
        id: 'models',
        label: 'Apparati',
        labelKey: 'tabs.models',
        type: 'models',
        pinned: false,
      },
      this.role.canViewCatalog(),
    );
  }

  ensureModelsTab(): void {
    this.ensureTab({
      id: 'models',
      label: 'Apparati',
      labelKey: 'tabs.models',
      type: 'models',
      pinned: false,
    });
  }

  openRacks(): void {
    this.openTab(
      {
        id: 'racks',
        label: 'Rack',
        labelKey: 'tabs.racks',
        type: 'racks',
        pinned: false,
      },
      this.role.canViewInfrastructure(),
    );
  }

  ensureRacksTab(): void {
    this.ensureTab({
      id: 'racks',
      label: 'Rack',
      labelKey: 'tabs.racks',
      type: 'racks',
      pinned: false,
    });
  }

  openComponents(): void {
    this.openAssetSettings();
  }

  ensureComponentsTab(): void {
    this.ensureAssetSettingsTab();
  }

  openRackModels(): void {
    this.openAssetSettings();
  }

  ensureRackModelsTab(): void {
    this.ensureAssetSettingsTab();
  }

  openLocations(): void {
    this.openAssetSettings();
  }

  ensureLocationsTab(): void {
    this.ensureAssetSettingsTab();
  }

  openAssetSettings(): void {
    this.openTab(
      {
        id: 'asset-settings',
        label: 'Asset Settings',
        labelKey: 'tabs.asset_settings',
        type: 'asset-settings',
        pinned: false,
      },
      this.role.isAdmin() ||
        this.role.canViewInfrastructure() ||
        this.role.canViewCatalog(),
    );
  }

  ensureAssetSettingsTab(): void {
    this.ensureTab({
      id: 'asset-settings',
      label: 'Asset Settings',
      labelKey: 'tabs.asset_settings',
      type: 'asset-settings',
      pinned: false,
    });
  }

  openWarehouse(): void {
    this.openTab(
      {
        id: 'warehouse',
        label: 'Magazzino',
        labelKey: 'tabs.warehouse',
        type: 'warehouse',
        pinned: false,
      },
      this.role.canViewInfrastructure(),
    );
  }

  ensureWarehouseTab(): void {
    this.ensureTab({
      id: 'warehouse',
      label: 'Magazzino',
      labelKey: 'tabs.warehouse',
      type: 'warehouse',
      pinned: false,
    });
  }

  openAdmin(): void {
    this.openTab({
      id: 'admin',
      label: 'Users',
      labelKey: 'tabs.admin',
      type: 'admin',
      pinned: false,
    });
  }

  ensureAdminTab(): void {
    this.ensureTab({
      id: 'admin',
      label: 'Users',
      labelKey: 'tabs.admin',
      type: 'admin',
      pinned: false,
    });
  }

  openOptions(): void {
    this.openTab({
      id: 'options',
      label: 'Options',
      labelKey: 'tabs.options',
      type: 'options',
      pinned: false,
    });
  }

  ensureOptionsTab(): void {
    this.ensureTab({
      id: 'options',
      label: 'Options',
      labelKey: 'tabs.options',
      type: 'options',
      pinned: false,
    });
  }

  openAsset(assetId: number, label: string): void {
    this.openTab(
      { id: `asset-${assetId}`, label, type: 'asset', assetId, pinned: false },
      this.role.canViewAssets(),
    );
  }

  ensureAssetTab(assetId: number, label: string): void {
    this.ensureTab({
      id: `asset-${assetId}`,
      label,
      type: 'asset',
      assetId,
      pinned: false,
    });
  }

  // ── Label update ──────────────────────────────────────────

  updateTabLabel(tabId: string, label: string): void {
    this._tabs.update((tabs) =>
      tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    );
    this.persistTabs();
  }

  // ── Not-found notification helpers ────────────────────────

  reportRoomNotFound(roomId: number): void {
    this.closeTab(`room-${roomId}`);
    this._roomNotFound$.next(roomId);
  }

  reportRackNotFound(rackName: string): void {
    this.closeTab(`rack-${rackName}`);
    this._rackNotFound$.next(rackName);
  }

  // ── Permission filtering ──────────────────────────────────

  /** Removes any tab the current user no longer has permission to see. */
  purgeForbiddenTabs(): void {
    this._tabs.update((tabs) => tabs.filter((t) => this.isTabAllowed(t)));
    this.persistTabs();
  }

  // ── Close / reorder ───────────────────────────────────────

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
