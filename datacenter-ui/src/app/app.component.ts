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
import { TabService } from './modules/core/services/tab.service';
import { PanelTab } from './modules/data-center/components/detail-panel/detail-panel.types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [HeaderComponent, HomeComponent, MapComponent, RackComponent],
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
      this.navigateToTab(tabId);
    });
  }

  private syncFromUrl(): void {
    const tree = this.router.parseUrl(this.router.url);
    const segments = tree.root.children['primary']?.segments ?? [];
    const tabParam: string | null = tree.queryParams['tab'] ?? null;

    if (segments[0]?.path === 'map') {
      const rawId = segments[1]?.path;
      const roomId = rawId ? +rawId : NaN;

      if (tabParam?.startsWith('rack-')) {
        this.activeTabId = tabParam;
      } else if (!isNaN(roomId)) {
        this.activeTabId = `room-${roomId}`;
      } else {
        // /map with no room ID — fall back to home
        this.activeTabId = 'home';
      }
    } else {
      this.activeTabId = 'home';
    }
  }

  activateTab(tabId: string): void {
    this.navigateToTab(tabId);
  }

  closeTab(tabId: string, event: MouseEvent): void {
    event.stopPropagation();
    const wasActive = this.activeTabId === tabId;
    this.tabService.closeTab(tabId);
    if (wasActive) {
      this.navigateToTab('home');
    }
    this.cdr.markForCheck();
  }

  private navigateToTab(tabId: string): void {
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
      // Rack tabs keep the current room URL
      const tree = this.router.parseUrl(this.router.url);
      const segments = tree.root.children['primary']?.segments ?? [];
      const base =
        segments[0]?.path === 'map' && segments[1]?.path
          ? ['/map', segments[1].path]
          : ['/map'];
      this.router.navigate(base, {
        queryParams: { tab: tabId },
        queryParamsHandling: 'merge',
      });
    }
  }
}
