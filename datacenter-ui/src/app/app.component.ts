import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, startWith } from 'rxjs/operators';
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
  private readonly cdr = inject(ChangeDetectorRef);
  readonly tabService = inject(TabService);

  readonly homeTab: PanelTab = {
    id: 'home',
    label: 'Home',
    type: 'home',
    pinned: true,
  };

  get tabs(): PanelTab[] {
    return [this.homeTab, ...this.tabService.tabs()];
  }

  activeTabId = 'home';
  private tabHistory: string[] = ['home'];

  ngOnInit(): void {
    // Sync active tab from URL on every navigation
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        startWith(null as NavigationEnd | null),
      )
      .subscribe(() => {
        this.syncFromUrl();
        this.cdr.markForCheck();
      });

    // When a room/rack is opened, navigate to activate it
    this.tabService.activate$.subscribe((tabId) => {
      this.pushTabHistory(tabId);
      this.navigateToTab(tabId);
    });

    // When a rack fails to load (not found), close its tab and show 404
    this.tabService.rackNotFound$.subscribe(() => {
      this.activeTabId = 'not-found';
      this.router.navigate(['/not-found']);
      this.cdr.markForCheck();
    });

    // When a room fails to load (not found), close its tab and show 404
    this.tabService.roomNotFound$.subscribe(() => {
      this.activeTabId = 'not-found';
      this.router.navigate(['/not-found']);
      this.cdr.markForCheck();
    });
  }

  private syncFromUrl(): void {
    const tree = this.router.parseUrl(this.router.url);
    const segments = tree.root.children['primary']?.segments ?? [];

    if (segments[0]?.path === 'rack') {
      const rackName = segments[1]?.path;
      if (rackName) {
        const tabId = `rack-${rackName}`;
        this.tabService.ensureRackTab(rackName);
        this.activeTabId = tabId;
      } else {
        this.activeTabId = 'home';
      }
    } else if (segments[0]?.path === 'map') {
      const rawId = segments[1]?.path;
      const roomId = rawId ? +rawId : NaN;

      if (!isNaN(roomId)) {
        const tabId = `room-${roomId}`;
        this.tabService.ensureRoomTab(roomId, `Room #${roomId}`);
        this.activeTabId = tabId;
      } else {
        this.activeTabId = 'home';
      }
    } else if (segments[0]?.path === 'not-found') {
      this.activeTabId = 'not-found';
    } else {
      this.activeTabId = 'home';
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
    const wasActive = this.activeTabId === tabId;
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
    this.cdr.markForCheck();
  }

  private navigateToTab(tabId: string): void {
    if (tabId === 'not-found') return;
    if (tabId === 'home') {
      this.router.navigate(['/']);
      return;
    }
    if (tabId.startsWith('room-')) {
      const roomId = +tabId.slice(5);
      this.router.navigate(['/map', roomId]);
      return;
    }
    if (tabId.startsWith('rack-')) {
      const rackName = tabId.slice(5);
      this.router.navigate(['/rack', rackName]);
    }
  }
}
