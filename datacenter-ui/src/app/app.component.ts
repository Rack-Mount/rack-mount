import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { merge } from 'rxjs';
import { filter, startWith } from 'rxjs/operators';
import { UsersListComponent } from './modules/admin/components/users-list/users-list.component';
import { ChangePasswordComponent } from './modules/core/components/change-password/change-password.component';
import { HeaderComponent } from './modules/core/components/header/header.component';
import { HomeComponent } from './modules/core/components/home/home.component';
import { NotFoundComponent } from './modules/core/components/not-found/not-found.component';
import { TabBarComponent } from './modules/core/components/tab-bar/tab-bar.component';
import { ToastComponent } from './modules/core/components/toast/toast.component';
import { AuthService } from './modules/core/services/auth.service';
import { TabService } from './modules/core/services/tab.service';
import { ThemeService } from './modules/core/services/theme.service';
import { AssetsListComponent } from './modules/data-center/components/assets/assets-list/assets-list.component';
import { PanelTab } from './modules/data-center/components/assets/detail-panel/detail-panel.types';
import { ComponentsListComponent } from './modules/data-center/components/catalog/components-list/components-list.component';
import { ModelsListComponent } from './modules/data-center/components/catalog/models-list/models-list.component';
import { VendorsListComponent } from './modules/data-center/components/catalog/vendors-list/vendors-list.component';
import { MapComponent } from './modules/data-center/components/infrastructure/map/map.component';
import { RackComponent } from './modules/data-center/components/infrastructure/rack/rack.component';
import { RacksListComponent } from './modules/data-center/components/infrastructure/racks-list/racks-list.component';

/** Maps static tab IDs to their router paths (no dynamic segment). */
const STATIC_TAB_PATHS: Record<string, string[]> = {
  home: ['/'],
  assets: ['/assets'],
  vendors: ['/vendors'],
  models: ['/models'],
  components: ['/components'],
  racks: ['/racks'],
  admin: ['/admin'],
  'change-password': ['/change-password'],
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    TabBarComponent,
    HomeComponent,
    MapComponent,
    RackComponent,
    RacksListComponent,
    NotFoundComponent,
    AssetsListComponent,
    VendorsListComponent,
    ModelsListComponent,
    ComponentsListComponent,
    UsersListComponent,
    ChangePasswordComponent,
    TranslatePipe,
    ToastComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly tabService = inject(TabService);
  private readonly themeService = inject(ThemeService);
  readonly auth = inject(AuthService);

  readonly homeTab: PanelTab = {
    id: 'home',
    label: 'Home',
    labelKey: 'tabs.home',
    type: 'home',
    pinned: true,
  };

  readonly tabs = computed(() => [this.homeTab, ...this.tabService.tabs()]);
  readonly activeTabId = signal('home');
  private tabHistory: string[] = ['home'];
  ngOnInit(): void {
    // Apply the persisted or OS-default theme immediately
    this.themeService.init();

    // Sync active tab from URL on every navigation
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        startWith(null as NavigationEnd | null),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.syncFromUrl());

    // When a room/rack is opened, navigate to activate it
    this.tabService.activate$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((tabId) => {
        this.pushTabHistory(tabId);
        this.navigateToTab(tabId);
      });

    // When a rack or room fails to load (not found), close its tab and show 404
    merge(this.tabService.rackNotFound$, this.tabService.roomNotFound$)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.showNotFound());
  }

  private showNotFound(): void {
    this.activeTabId.set('not-found');
    this.router.navigate(['/not-found']);
  }

  private syncFromUrl(): void {
    const tree = this.router.parseUrl(this.router.url);
    const segments = tree.root.children['primary']?.segments ?? [];
    const first = segments[0]?.path;

    if (first === 'rack') {
      const rackName = segments[1]?.path;
      if (rackName) {
        this.tabService.ensureRackTab(rackName);
        this.activeTabId.set(`rack-${rackName}`);
      } else {
        this.activeTabId.set('home');
      }
      return;
    }

    if (first === 'map') {
      const roomId = +(segments[1]?.path ?? '');
      if (!isNaN(roomId)) {
        this.tabService.ensureRoomTab(roomId, `Room #${roomId}`);
        this.activeTabId.set(`room-${roomId}`);
      } else {
        this.activeTabId.set('home');
      }
      return;
    }

    const urlEnsureMap: Record<string, () => void> = {
      assets: () => {
        this.tabService.ensureAssetsTab();
        this.activeTabId.set('assets');
      },
      vendors: () => {
        this.tabService.ensureVendorsTab();
        this.activeTabId.set('vendors');
      },
      models: () => {
        this.tabService.ensureModelsTab();
        this.activeTabId.set('models');
      },
      components: () => {
        this.tabService.ensureComponentsTab();
        this.activeTabId.set('components');
      },
      racks: () => {
        this.tabService.ensureRacksTab();
        this.activeTabId.set('racks');
      },
      admin: () => {
        this.tabService.ensureAdminTab();
        this.activeTabId.set('admin');
      },
      'change-password': () => {
        this.tabService.ensureChangePasswordTab();
        this.activeTabId.set('change-password');
      },
      'not-found': () => {
        this.activeTabId.set('not-found');
      },
    };

    if (first && urlEnsureMap[first]) {
      urlEnsureMap[first]();
    } else {
      this.activeTabId.set('home');
    }
  }

  activateTab(tabId: string): void {
    this.pushTabHistory(tabId);
    this.navigateToTab(tabId);
  }

  private pushTabHistory(tabId: string): void {
    if (tabId === 'not-found') return;
    this.tabHistory = this.tabHistory.filter((id) => id !== tabId);
    this.tabHistory.push(tabId);
  }

  closeTab(tabId: string, event: MouseEvent): void {
    event.stopPropagation();
    const wasActive = this.activeTabId() === tabId;
    this.tabHistory = this.tabHistory.filter((id) => id !== tabId);
    this.tabService.closeTab(tabId);
    if (wasActive) {
      const remainingIds = new Set([
        'home',
        ...this.tabService.tabs().map((t) => t.id),
      ]);
      const previous =
        [...this.tabHistory].reverse().find((id) => remainingIds.has(id)) ??
        'home';
      this.navigateToTab(previous);
    }
  }

  private navigateToTab(tabId: string): void {
    if (tabId === 'not-found') return;
    if (STATIC_TAB_PATHS[tabId]) {
      this.router.navigate(STATIC_TAB_PATHS[tabId]);
      return;
    }
    if (tabId.startsWith('room-')) {
      this.router.navigate(['/map', +tabId.slice(5)]);
      return;
    }
    if (tabId.startsWith('rack-')) {
      this.router.navigate(['/rack', tabId.slice(5)]);
    }
  }

  protected onRackNotFound(rackName: string): void {
    this.tabService.reportRackNotFound(rackName);
  }
}
