import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PanelTab } from '../../../data-center/components/assets/detail-panel/detail-panel.types';
import { TabService } from '../../services/tab.service';

const TAB_ICONS: Record<string, string> = {
  rack: '🖥️',
  room: '🗺️',
  assets: '📦',
  vendors: '🏭',
  models: '🗂️',
  components: '🔌',
  racks: '🗄️',
  admin: '👥',
  options: '⚙️',
  home: '🏠',
  'rack-models': '📐',
  locations: '📍',
  'asset-settings': '🔧',
};

@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './tab-bar.component.html',
  styleUrl: './tab-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabBarComponent {
  private readonly tabService = inject(TabService);

  readonly tabs = input.required<PanelTab[]>();
  readonly activeTabId = input.required<string>();

  readonly tabActivate = output<string>();
  readonly tabClose = output<{ id: string; event: MouseEvent }>();

  readonly _dragTabId = signal<string | null>(null);
  readonly _dragOverId = signal<string | null>(null);
  readonly _dragOverEnd = signal(false);

  protected tabIcon(type: string): string {
    return TAB_ICONS[type] ?? '🏠';
  }

  protected onCloseClick(tabId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.tabClose.emit({ id: tabId, event });
  }

  protected onTabDragStart(tabId: string, event: DragEvent): void {
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', tabId);
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
}
