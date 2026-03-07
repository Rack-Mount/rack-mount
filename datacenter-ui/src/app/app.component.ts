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
import { merge } from 'rxjs';
import { filter, startWith } from 'rxjs/operators';
import { HeaderComponent } from './modules/core/components/header/header.component';
import { HomeComponent } from './modules/core/components/home/home.component';
import { TabBarComponent } from './modules/core/components/tab-bar/tab-bar.component';
import { ToastComponent } from './modules/core/components/toast/toast.component';
import { AuthService } from './modules/core/services/auth.service';
import { TabService } from './modules/core/services/tab.service';
import { ThemeService } from './modules/core/services/theme.service';
import { PanelTab } from './modules/data-center/components/assets/detail-panel/detail-panel.types';
import { MapComponent } from './modules/data-center/components/infrastructure/map/map.component';
import { RackComponent } from './modules/data-center/components/infrastructure/rack/rack.component';

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

/**
 * Tab IDs whose content is served by Angular Router's <router-outlet>.
 * These are lazily loaded via loadComponent() in app.routes.ts.
 */
const STATIC_TABS = new Set([
  'assets',
  'vendors',
  'models',
  'components',
  'racks',
  'admin',
  'change-password',
  'not-found',
]);

@Component({
  selector: 'app-root',
  standalone: true,
  // Static pane components are NOT imported here — they are loaded on demand
  // by Angular Router (loadComponent in app.routes.ts) and rendered via the
  // single <router-outlet> in the template.
  // Only always-visible or @defer-based dynamic panes are listed below.
  imports: [
    RouterOutlet,
    HeaderComponent,
    TabBarComponent,
    HomeComponent,
    MapComponent,
    RackComponent,
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

  /** True when the active tab's content is served by <router-outlet>. */
  readonly isStaticTab = computed(() => STATIC_TABS.has(this.activeTabId()));
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
