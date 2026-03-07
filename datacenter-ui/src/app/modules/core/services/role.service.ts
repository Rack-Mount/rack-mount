import { computed, Injectable, signal } from '@angular/core';

export interface RoleData {
  name: string;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_import_export: boolean;
  can_access_assets: boolean;
  can_access_catalog: boolean;
  can_manage_users: boolean;
}

const STORAGE_KEY = 'auth_role';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly _role = signal<RoleData | null>(this._loadFromStorage());

  readonly role = this._role.asReadonly();

  readonly isAdmin = computed(() => this._role()?.name === 'admin');
  readonly canCreate = computed(() => this._role()?.can_create ?? false);
  readonly canEdit = computed(() => this._role()?.can_edit ?? false);
  readonly canDelete = computed(() => this._role()?.can_delete ?? false);
  readonly canImportExport = computed(
    () => this._role()?.can_import_export ?? false,
  );
  readonly canManageUsers = computed(
    () => this._role()?.can_manage_users ?? false,
  );

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
