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
import { BackendErrorService } from '../../services/backend-error.service';

type SaveState = 'idle' | 'saving' | 'success' | 'error';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordComponent {
  private readonly http = inject(HttpClient);
  private readonly backendErr = inject(BackendErrorService);

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly saveState = signal<SaveState>('idle');
  protected readonly errorMsg = signal('');

  private readonly url = `${environment.service_url}/auth/change-password/`;

  protected submit(): void {
    if (this.newPassword() !== this.confirmPassword()) {
      this.saveState.set('error');
      this.errorMsg.set('change_password.error_mismatch');
      return;
    }
    this.saveState.set('saving');
    this.errorMsg.set('');
    this.http
      .post(this.url, {
        current_password: this.currentPassword(),
        new_password: this.newPassword(),
      })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          this.saveState.set('error');
          this.errorMsg.set(this.backendErr.parse(err));
          return EMPTY;
        }),
      )
      .subscribe(() => {
        this.saveState.set('success');
        this.currentPassword.set('');
        this.newPassword.set('');
        this.confirmPassword.set('');
      });
  }

  protected reset(): void {
    this.currentPassword.set('');
    this.newPassword.set('');
    this.confirmPassword.set('');
    this.saveState.set('idle');
    this.errorMsg.set('');
  }
}
