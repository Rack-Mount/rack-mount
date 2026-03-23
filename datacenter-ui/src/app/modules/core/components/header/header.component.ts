import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { RoleService } from '../../services/role.service';
import { TabService } from '../../services/tab.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  protected readonly lang = inject(LanguageService);
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  protected readonly role = inject(RoleService);
  private readonly tabService = inject(TabService);
  private readonly router = inject(Router);

  protected openAdmin(): void {
    this.tabService.openAdmin();
  }

  protected openOptions(): void {
    this.tabService.openOptions();
  }

  protected openAssetSettings(): void {
    this.tabService.openAssetSettings();
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => {},
      error: () => this.router.navigate(['/login']),
      complete: () => this.router.navigate(['/login']),
    });
  }
}
