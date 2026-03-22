import { computed, Injectable, signal } from '@angular/core';

export interface RoleData {
  name: string;
  // Assets
  can_view_assets: boolean;
  can_create_assets: boolean;
  can_edit_assets: boolean;
  can_delete_assets: boolean;
  can_import_assets: boolean;
  can_export_assets: boolean;
  can_clone_assets: boolean;
  // Catalog
  can_view_catalog: boolean;
  can_create_catalog: boolean;
  can_edit_catalog: boolean;
  can_delete_catalog: boolean;
  can_import_catalog: boolean;
  // Infrastructure
  can_view_infrastructure: boolean;
  can_create_racks: boolean;
  can_edit_racks: boolean;
  can_delete_racks: boolean;
  can_edit_map: boolean;
  // Admin
  can_manage_users: boolean;
  // Model training (YOLO port detection)
  can_provide_port_training: boolean;
  can_provide_port_corrections: boolean;
  can_view_model_training_status: boolean;
}

const STORAGE_KEY = 'auth_role';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly _role = signal<RoleData | null>(this._loadFromStorage());

  readonly role = this._role.asReadonly();

  readonly isAdmin = computed(() => this._role()?.name === 'admin');

  // ── Permission signals ────────────────────────────────────────────────────
  // All grouped into one base computed so _role() is read once per change cycle.
  private readonly _p = computed(() => this._role());

  // Assets
  readonly canViewAssets = computed(() => this._p()?.can_view_assets ?? false);
  readonly canCreateAssets = computed(
    () => this._p()?.can_create_assets ?? false,
  );
  readonly canEditAssets = computed(() => this._p()?.can_edit_assets ?? false);
  readonly canDeleteAssets = computed(
    () => this._p()?.can_delete_assets ?? false,
  );
  readonly canImportAssets = computed(
    () => this._p()?.can_import_assets ?? false,
  );
  readonly canExportAssets = computed(
    () => this._p()?.can_export_assets ?? false,
  );
  readonly canCloneAssets = computed(
    () => this._p()?.can_clone_assets ?? false,
  );

  // Catalog
  readonly canViewCatalog = computed(
    () => this._p()?.can_view_catalog ?? false,
  );
  readonly canCreateCatalog = computed(
    () => this._p()?.can_create_catalog ?? false,
  );
  readonly canEditCatalog = computed(
    () => this._p()?.can_edit_catalog ?? false,
  );
  readonly canDeleteCatalog = computed(
    () => this._p()?.can_delete_catalog ?? false,
  );
  readonly canImportCatalog = computed(
    () => this._p()?.can_import_catalog ?? false,
  );

  // Infrastructure
  readonly canViewInfrastructure = computed(
    () => this._p()?.can_view_infrastructure ?? false,
  );
  readonly canCreateRacks = computed(
    () => this._p()?.can_create_racks ?? false,
  );
  readonly canEditRacks = computed(() => this._p()?.can_edit_racks ?? false);
  readonly canDeleteRacks = computed(
    () => this._p()?.can_delete_racks ?? false,
  );
  readonly canEditMap = computed(() => this._p()?.can_edit_map ?? false);

  // Admin
  readonly canManageUsers = computed(
    () => this._p()?.can_manage_users ?? false,
  );

  // Model training
  readonly canProvidePortTraining = computed(
    () => this._p()?.can_provide_port_training ?? false,
  );
  readonly canProvidePortCorrections = computed(
    () => this._p()?.can_provide_port_corrections ?? false,
  );
  readonly canViewModelTrainingStatus = computed(
    () => this._p()?.can_view_model_training_status ?? false,
  );

  /** Imperative helper for TypeScript code: `role.can('can_delete_catalog')` */
  can(flag: keyof Omit<RoleData, 'name'>): boolean {
    return !!this._role()?.[flag];
  }

  private _loadFromStorage(): RoleData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as RoleData) : null;
    } catch {
      return null;
    }
  }

  load(role: RoleData): void {
    this._role.set(role);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(role));
  }

  clear(): void {
    this._role.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }
}
