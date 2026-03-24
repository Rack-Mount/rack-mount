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
import { Asset, AssetService, LocationService, Rack } from '../../../../core/api/v1';
import { RackComponent } from '../../infrastructure/rack/rack.component';
import { AssetDeviceViewComponent } from './asset-device-view/asset-device-view.component';
import { PanelTab } from './detail-panel.types';

@Component({
  selector: 'app-detail-panel',
  standalone: true,
  imports: [
    CommonModule,
    RackComponent,
    AssetDeviceViewComponent,
    TranslatePipe,
  ],
  templateUrl: './detail-panel.component.html',
  styleUrl: './detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailPanelComponent {
  private readonly assetService = inject(AssetService);
  private readonly locationService = inject(LocationService);
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
  protected readonly activeAsset = signal<Asset | null>(null);
  protected readonly loading = signal(false);

  constructor() {
    toObservable(this.activeTab)
      .pipe(
        switchMap((tab) => {
          if (tab?.type === 'rack' && tab.rackName) {
            return this.locationService
              .locationRackRetrieve({ name: tab.rackName })
              .pipe(
                map((rack) => ({ rack, asset: null, loading: false })),
                catchError((err) => {
                  console.error('Failed to load rack detail', err);
                  return of({ rack: null, asset: null, loading: false });
                }),
                startWith({ rack: null, asset: null, loading: true }),
              );
          }
          if (tab?.type === 'asset' && tab.assetId != null) {
            return this.assetService
              .assetAssetRetrieve({ id: tab.assetId })
              .pipe(
                map((asset) => ({ asset, rack: null, loading: false })),
                catchError((err) => {
                  console.error('Failed to load asset detail', err);
                  return of({ asset: null, rack: null, loading: false });
                }),
                startWith({ asset: null, rack: null, loading: true }),
              );
          }
          return of({ rack: null, asset: null, loading: false });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ rack, asset, loading }) => {
        this.activeRack.set(rack);
        this.activeAsset.set(asset);
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
