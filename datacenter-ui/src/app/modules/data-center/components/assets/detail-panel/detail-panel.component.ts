import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AssetService, Rack } from '../../../../core/api/v1';
import { RackComponent } from '../../infrastructure/rack/rack.component';
import { PanelTab } from './detail-panel.types';

@Component({
  selector: 'app-detail-panel',
  standalone: true,
  imports: [CommonModule, RackComponent, TranslatePipe],
  templateUrl: './detail-panel.component.html',
  styleUrl: './detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailPanelComponent {
  private readonly assetService = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs = input<PanelTab[]>([]);
  readonly activeTabId = input<string | null>(null);

  readonly tabClose = output<string>();
  readonly tabActivate = output<string>();
  readonly panelClose = output<void>();

  readonly activeTab = computed<PanelTab | undefined>(() =>
    this.tabs().find((t) => t.id === this.activeTabId()),
  );

  protected readonly activeRack = signal<Rack | null>(null);
  protected readonly loading = signal(false);

  constructor() {
    toObservable(this.activeTab)
      .pipe(
        switchMap((tab) => {
          if (tab?.type === 'rack' && tab.rackName) {
            return this.assetService
              .assetRackRetrieve({ name: tab.rackName })
              .pipe(
                map((rack) => ({ rack, loading: false })),
                catchError((err) => {
                  console.error('Failed to load rack detail', err);
                  return of({ rack: null, loading: false });
                }),
                startWith({ rack: null, loading: true }),
              );
          }
          return of({ rack: null, loading: false });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ rack, loading }) => {
        this.activeRack.set(rack);
        this.loading.set(loading);
      });
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
