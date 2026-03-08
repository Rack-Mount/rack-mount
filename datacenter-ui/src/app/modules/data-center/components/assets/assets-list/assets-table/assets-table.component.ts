import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoleService } from '../../../../../core/services/role.service';
import { TabService } from '../../../../../core/services/tab.service';
import { AssetRowDetailComponent } from '../asset-row-detail/asset-row-detail.component';
import { formatDate, relativeDate, stateColor } from '../assets-list-utils';
import { AssetsListStore } from '../assets-list.store';
import { AssetsBulkBarComponent } from './assets-bulk-bar/assets-bulk-bar.component';
import { AssetsPaginationComponent } from './assets-pagination/assets-pagination.component';

@Component({
  selector: 'app-assets-table',
  standalone: true,
  imports: [
    TranslatePipe,
    AssetRowDetailComponent,
    AssetsBulkBarComponent,
    AssetsPaginationComponent,
  ],
  templateUrl: './assets-table.component.html',
  styleUrl: './assets-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsTableComponent {
  protected readonly store = inject(AssetsListStore);
  protected readonly role = inject(RoleService);
  private readonly tabService = inject(TabService);

  protected readonly stateColor = stateColor;
  protected readonly formatDate = formatDate;
  protected readonly relativeDate = relativeDate;
  protected readonly skeletonRows = Array.from({ length: 10 }, (_, i) => i);

  protected onOpenStatePicker(assetId: number, event: MouseEvent): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pickerW = 200;
    const pickerH = Math.min(this.store.availableStates().length * 36 + 8, 280);
    const idealX = rect.right + 6;
    const x =
      idealX + pickerW > window.innerWidth - 4
        ? rect.left - pickerW - 4
        : idealX;
    const idealY = rect.top - 4;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - pickerH - 4));
    this.store.onStatePickerOpen({ assetId, x, y });
  }

  protected onSelectRow(assetId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.store.toggleSelectRow(assetId);
  }

  protected onOpenMonitor(assetId: number, event: MouseEvent): void {
    event.stopPropagation();
    const asset = this.store.assets().find((a) => a.id === assetId);
    if (asset) {
      const label = asset.hostname || asset.model.name || `#${asset.id}`;
      this.tabService.openAsset(asset.id, label);
    }
  }
}
