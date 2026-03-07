import { HttpClient, HttpStatusCode } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly lang = inject(LanguageService);
  protected readonly theme = inject(ThemeService);

  protected username = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected onSubmit(): void {
    if (!this.username || !this.password || this.loading()) return;

    this.loading.set(true);
    this.errorKey.set(null);

    this.http
      .post<{
        access: string;
        refresh: string;
      }>(`${environment.service_url}/auth/token/`, {
        username: this.username,
        password: this.password,
      })
      .subscribe({
        next: (tokens) => {
          this.auth.login(this.username, tokens);
          const returnUrl =
            this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
          this.router.navigateByUrl(returnUrl);
        },
        error: (err) => {
          this.loading.set(false);
          if (err.status === HttpStatusCode.Unauthorized) {
            this.errorKey.set('login.invalid_credentials');
          } else {
            this.errorKey.set('login.error');
          }
        },
      });
  }
}
