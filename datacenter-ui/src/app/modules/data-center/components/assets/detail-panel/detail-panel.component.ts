import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AssetService, Rack } from '../../../../core/api/v1';
import { RackComponent } from '../../infrastructure/rack/rack.component';
import { PanelTab } from './detail-panel.types';

@Component({
  selector: 'app-detail-panel',
  standalone: true,
  imports: [CommonModule, RackComponent],
  templateUrl: './detail-panel.component.html',
  styleUrl: './detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailPanelComponent implements OnChanges {
  @Input() tabs: PanelTab[] = [];
  @Input() activeTabId: string | null = null;

  @Output() tabClose = new EventEmitter<string>();
  @Output() tabActivate = new EventEmitter<string>();
  @Output() panelClose = new EventEmitter<void>();

  activeRack: Rack | null = null;
  loading = false;

  constructor(
    private readonly assetService: AssetService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get activeTab(): PanelTab | undefined {
    return this.tabs.find((t) => t.id === this.activeTabId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['activeTabId'] || changes['tabs']) {
      this.loadActiveRack();
    }
  }

  private loadActiveRack(): void {
    const tab = this.activeTab;
    if (tab?.type === 'rack' && tab.rackName) {
      this.loading = true;
      this.activeRack = null;
      this.assetService.assetRackRetrieve({ name: tab.rackName }).subscribe({
        next: (rack) => {
          this.activeRack = rack;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Failed to load rack detail', err);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
    } else {
      this.activeRack = null;
    }
  }

  activate(tabId: string): void {
    this.tabActivate.emit(tabId);
  }

  close(tabId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.tabClose.emit(tabId);
  }

  closePanel(): void {
    this.panelClose.emit();
  }
}
