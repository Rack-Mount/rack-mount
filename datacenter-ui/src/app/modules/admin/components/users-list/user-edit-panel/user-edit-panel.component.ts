import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, EMPTY } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { BackendErrorService } from '../../../../core/services/backend-error.service';
import {
  RoleSummary,
  UserItem,
  UserUpdatePayload,
} from '../users-list.component';

type SaveState = 'idle' | 'saving' | 'error';

@Component({
  selector: 'app-user-edit-panel',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './user-edit-panel.component.html',
  styleUrl: './user-edit-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserEditPanelComponent {
  private readonly http = inject(HttpClient);
  private readonly backendErr = inject(BackendErrorService);

  private readonly baseUrl = `${environment.service_url}/auth/users/`;

  readonly user = input.required<UserItem>();
  readonly roles = input.required<RoleSummary[]>();

  readonly saved = output<UserItem>();
  readonly cancelled = output<void>();

  protected readonly editUsername = signal('');
  protected readonly editEmail = signal('');
  protected readonly editRoleId = signal<number | null>(null);
  protected readonly editIsActive = signal(true);
  protected readonly editPassword = signal('');
  protected readonly editSave = signal<SaveState>('idle');
  protected readonly editError = signal('');

  constructor() {
    // Re-initialize the form whenever the bound user changes
    effect(() => {
      const u = this.user();
      this.editUsername.set(u.username);
      this.editEmail.set(u.email);
      this.editRoleId.set(u.role?.id ?? null);
      this.editIsActive.set(u.is_active);
      this.editPassword.set('');
      this.editSave.set('idle');
      this.editError.set('');
    });
  }

  protected submitEdit(): void {
    const id = this.user().id;
    this.editSave.set('saving');
    const payload: UserUpdatePayload = {
      username: this.editUsername().trim() || undefined,
      email: this.editEmail().trim() || undefined,
      role_id: this.editRoleId() ?? undefined,
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
        this.editSave.set('idle');
        this.saved.emit(updated);
      });
  }
}
