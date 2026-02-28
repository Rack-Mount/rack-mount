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
import { NavigationEnd, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { merge } from 'rxjs';
import { filter, startWith } from 'rxjs/operators';
import { HeaderComponent } from './modules/core/components/header/header.component';
import { HomeComponent } from './modules/core/components/home/home.component';
import { NotFoundComponent } from './modules/core/components/not-found/not-found.component';
import { TabService } from './modules/core/services/tab.service';
import { ThemeService } from './modules/core/services/theme.service';
import { AssetsListComponent } from './modules/data-center/components/assets/assets-list/assets-list.component';
import { PanelTab } from './modules/data-center/components/assets/detail-panel/detail-panel.types';
import { ModelsListComponent } from './modules/data-center/components/catalog/models-list/models-list.component';
import { VendorsListComponent } from './modules/data-center/components/catalog/vendors-list/vendors-list.component';
import { MapComponent } from './modules/data-center/components/infrastructure/map/map.component';
import { RackComponent } from './modules/data-center/components/infrastructure/rack/rack.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    HeaderComponent,
    HomeComponent,
    MapComponent,
    RackComponent,
    NotFoundComponent,
    AssetsListComponent,
    VendorsListComponent,
    ModelsListComponent,
    TranslatePipe,
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

  readonly homeTab: PanelTab = {
    id: 'home',
    label: 'Home',
    type: 'home',
    pinned: true,
  };

  readonly tabs = computed(() => [this.homeTab, ...this.tabService.tabs()]);
  readonly activeTabId = signal('home');
  private tabHistory: string[] = ['home'];

  // ── Drag-and-drop tab reordering ─────────────────────────────
  readonly _dragTabId = signal<string | null>(null);
  readonly _dragOverId = signal<string | null>(null);
  readonly _dragOverEnd = signal(false);

  protected onTabDragStart(tabId: string, event: DragEvent): void {
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', tabId);
    // Small delay so the ghost is rendered before we mark the element dragging
    setTimeout(() => this._dragTabId.set(tabId), 0);
  }

  protected onTabDragOver(tabId: string, event: DragEvent): void {
    if (this._dragTabId() === null || tabId === 'home') return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this._dragOverEnd.set(false);
    if (this._dragOverId() !== tabId) this._dragOverId.set(tabId);
  }

  protected onTabDrop(tabId: string, event: DragEvent): void {
    event.preventDefault();
    const fromId = this._dragTabId();
    this._dragTabId.set(null);
    this._dragOverId.set(null);
    if (!fromId || fromId === tabId || tabId === 'home') return;
    this.tabService.reorderTabs(fromId, tabId);
  }

  protected onTabDragOverEnd(event: DragEvent): void {
    if (this._dragTabId() === null) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this._dragOverId.set(null);
    this._dragOverEnd.set(true);
  }

  protected onTabDropEnd(event: DragEvent): void {
    event.preventDefault();
    const fromId = this._dragTabId();
    this._dragTabId.set(null);
    this._dragOverEnd.set(false);
    if (!fromId) return;
    this.tabService.moveTabToEnd(fromId);
  }

  protected onTabDragEnd(): void {
    this._dragTabId.set(null);
    this._dragOverId.set(null);
    this._dragOverEnd.set(false);
  }

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
    } else if (segments[0]?.path === 'assets') {
      this.tabService.ensureAssetsTab();
      this.activeTabId.set('assets');
    } else if (segments[0]?.path === 'vendors') {
      this.tabService.ensureVendorsTab();
      this.activeTabId.set('vendors');
    } else if (segments[0]?.path === 'models') {
      this.tabService.ensureModelsTab();
      this.activeTabId.set('models');
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
    if (tabId === 'assets') {
      this.router.navigate(['/assets']);
      return;
    }
    if (tabId === 'vendors') {
      this.router.navigate(['/vendors']);
      return;
    }
    if (tabId === 'models') {
      this.router.navigate(['/models']);
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
