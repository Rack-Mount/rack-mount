import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, EMPTY } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { BackendErrorService } from '../../../core/services/backend-error.service';
import { RoleService } from '../../../core/services/role.service';

export interface UserRoleSummary {
  id: number;
  name: string;
}

export interface UserItem {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  date_joined: string;
  role: UserRoleSummary;
}

export interface UserCreatePayload {
  username: string;
  email: string;
  password: string;
  role_id: number;
}

export interface UserUpdatePayload {
  email?: string;
  is_active?: boolean;
  role_id?: number;
  password?: string;
}

type SaveState = 'idle' | 'saving' | 'error';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './users-list.component.html',
  styleUrl: './users-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersListComponent {
  protected readonly role = inject(RoleService);
  private readonly http = inject(HttpClient);
  private readonly backendErr = inject(BackendErrorService);

  private readonly baseUrl = `${environment.service_url}/auth/users/`;

  protected readonly users = signal<UserItem[]>([]);
  protected readonly loadError = signal(false);
  protected readonly loading = signal(true);

  // ── Create form ───────────────────────────────────────────────────────────
  protected readonly createOpen = signal(false);
  protected readonly createUsername = signal('');
  protected readonly createEmail = signal('');
  protected readonly createPassword = signal('');
  protected readonly createRoleId = signal<number>(3); // viewer default
  protected readonly createSave = signal<SaveState>('idle');
  protected readonly createError = signal('');

  // ── Edit form ─────────────────────────────────────────────────────────────
  protected readonly editId = signal<number | null>(null);
  protected readonly editEmail = signal('');
  protected readonly editRoleId = signal<number>(3);
  protected readonly editIsActive = signal(true);
  protected readonly editPassword = signal('');
  protected readonly editSave = signal<SaveState>('idle');
  protected readonly editError = signal('');

  // ── Delete ────────────────────────────────────────────────────────────────
  protected readonly deleteId = signal<number | null>(null);
  protected readonly deleteSave = signal<SaveState>('idle');
  protected readonly deleteErrorMsg = signal('');

  protected readonly roles = [
    { id: 1, name: 'admin' },
    { id: 2, name: 'editor' },
    { id: 3, name: 'viewer' },
    { id: 4, name: 'guest' },
  ];

  constructor() {
    this.loadUsers();
  }

  private loadUsers(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.http
      .get<{ results: UserItem[] }>(this.baseUrl)
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          this.loading.set(false);
          return EMPTY;
        }),
      )
      .subscribe((resp) => {
        this.users.set(resp.results);
        this.loading.set(false);
      });
  }

  protected openCreate(): void {
    this.createUsername.set('');
    this.createEmail.set('');
    this.createPassword.set('');
    this.createRoleId.set(3);
    this.createSave.set('idle');
    this.createError.set('');
    this.editId.set(null);
    this.createOpen.set(true);
  }

  protected cancelCreate(): void {
    this.createOpen.set(false);
  }

  protected submitCreate(): void {
    if (!this.createUsername().trim() || !this.createPassword().trim()) return;
    this.createSave.set('saving');
    const payload: UserCreatePayload = {
      username: this.createUsername().trim(),
      email: this.createEmail().trim(),
      password: this.createPassword(),
      role_id: this.createRoleId(),
    };
    this.http
      .post<UserItem>(this.baseUrl, payload)
      .pipe(
        catchError((err: HttpErrorResponse) => {
          this.createSave.set('error');
          this.createError.set(this.backendErr.parse(err));
          return EMPTY;
        }),
      )
      .subscribe((user) => {
        this.users.update((list) => [...list, user]);
        this.createOpen.set(false);
        this.createSave.set('idle');
      });
  }

  protected startEdit(user: UserItem): void {
    this.createOpen.set(false);
    this.editId.set(user.id);
    this.editEmail.set(user.email);
    this.editRoleId.set(user.role?.id ?? 3);
    this.editIsActive.set(user.is_active);
    this.editPassword.set('');
    this.editSave.set('idle');
    this.editError.set('');
  }

  protected cancelEdit(): void {
    this.editId.set(null);
  }

  protected submitEdit(): void {
    const id = this.editId();
    if (!id) return;
    this.editSave.set('saving');
    const payload: UserUpdatePayload = {
      email: this.editEmail().trim(),
      role_id: this.editRoleId(),
      is_active: this.editIsActive(),
    };
    if (this.editPassword().trim()) {
      payload.password = this.editPassword();
    }
    this.http
      .patch<UserItem>(`${this.baseUrl}${id}/`, payload)
      .pipe(
        catchError((err: HttpErrorResponse) => {
          this.editSave.set('error');
          this.editError.set(this.backendErr.parse(err));
          return EMPTY;
        }),
      )
      .subscribe((updated) => {
        this.users.update((list) =>
          list.map((u) => (u.id === id ? updated : u)),
        );
        this.editId.set(null);
        this.editSave.set('idle');
      });
  }

  protected startDelete(id: number): void {
    this.deleteId.set(id);
    this.deleteSave.set('idle');
    this.deleteErrorMsg.set('');
  }

  protected cancelDelete(): void {
    this.deleteId.set(null);
  }

  protected submitDelete(): void {
    const id = this.deleteId();
    if (!id) return;
    this.deleteSave.set('saving');
    this.http
      .delete(`${this.baseUrl}${id}/`)
      .pipe(
        catchError((err: HttpErrorResponse) => {
          this.deleteSave.set('error');
          this.deleteErrorMsg.set(this.backendErr.parse(err));
          return EMPTY;
        }),
      )
      .subscribe(() => {
        this.users.update((list) => list.filter((u) => u.id !== id));
        this.deleteId.set(null);
        this.deleteSave.set('idle');
      });
  }
}
