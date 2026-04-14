import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AssetCreateDrawerComponent } from './asset-create-drawer/asset-create-drawer.component';
import { AssetStatePickerComponent } from './asset-state-picker/asset-state-picker.component';
import { AssetsListStore } from './assets-list.store';
import { AssetsTableComponent } from './assets-table/assets-table.component';
import { AssetsToolbarComponent } from './assets-toolbar/assets-toolbar.component';

/**
 * Thin shell component. All state and business logic lives in AssetsListStore.
 * Overlays (drawers, pickers) are deferred — loaded lazily on first use.
 * AssetCreateDrawerComponent and AssetStatePickerComponent are in imports[]
 * but used exclusively in @defer blocks → Angular splits them into separate chunks.
 */
@Component({
  selector: 'app-assets-list',
  standalone: true,
  imports: [
    AssetsToolbarComponent,
    AssetsTableComponent,
    AssetStatePickerComponent,
    AssetCreateDrawerComponent,
  ],
  templateUrl: './assets-list.component.html',
  styleUrl: './assets-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AssetsListStore],
})
export class AssetsListComponent {
  protected readonly store = inject(AssetsListStore);
}
