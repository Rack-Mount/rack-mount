import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { merge } from 'rxjs';
import { filter, startWith } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HeaderComponent } from './modules/core/components/header/header.component';
import { HomeComponent } from './modules/core/components/home/home.component';
import { MapComponent } from './modules/data-center/components/map/map.component';
import { RackComponent } from './modules/data-center/components/rack/rack.component';
import { NotFoundComponent } from './modules/core/components/not-found/not-found.component';
import { TabService } from './modules/core/services/tab.service';
import { PanelTab } from './modules/data-center/components/detail-panel/detail-panel.types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    HeaderComponent,
    HomeComponent,
    MapComponent,
    RackComponent,
    NotFoundComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly tabService = inject(TabService);

  readonly homeTab: PanelTab = {
    id: 'home',
    label: 'Home',
    type: 'home',
    pinned: true,
  };

  readonly tabs = computed(() => [this.homeTab, ...this.tabService.tabs()]);
  readonly activeTabId = signal('home');
  private tabHistory: string[] = ['home'];

  ngOnInit(): void {
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

    if (segments[0]?.path === 'rack') {
      const rackName = segments[1]?.path;
      if (rackName) {
        this.tabService.ensureRackTab(rackName);
        this.activeTabId.set(`rack-${rackName}`);
      } else {
        this.activeTabId.set('home');
      }
    } else if (segments[0]?.path === 'map') {
      const rawId = segments[1]?.path;
      const roomId = rawId ? +rawId : NaN;
      if (!isNaN(roomId)) {
        this.tabService.ensureRoomTab(roomId, `Room #${roomId}`);
        this.activeTabId.set(`room-${roomId}`);
      } else {
        this.activeTabId.set('home');
      }
    } else if (segments[0]?.path === 'not-found') {
      this.activeTabId.set('not-found');
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
    if (tabId === 'home') {
      this.router.navigate(['/']);
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
}
