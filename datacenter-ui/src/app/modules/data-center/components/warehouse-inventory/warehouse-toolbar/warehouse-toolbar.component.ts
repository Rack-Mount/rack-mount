import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoleService } from '../../../../core/services/role.service';
import { WarehouseInventoryStore } from '../warehouse-inventory.store';

@Component({
  selector: 'app-warehouse-toolbar',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './warehouse-toolbar.component.html',
  styleUrl: './warehouse-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarehouseToolbarComponent {
  protected readonly role = inject(RoleService);
  protected readonly store = inject(WarehouseInventoryStore);

  protected onLocationFilter(val: string): void {
    this.store.onLocationFilter(val ? +val : null);
  }

  protected onWarehouseFilter(val: string): void {
    this.store.onWarehouseFilter(val ? +val : null);
  }

  protected onCategoryFilter(val: string): void {
    this.store.onCategoryFilter(val || null);
  }

  protected onBelowThreshold(val: boolean): void {
    this.store.onBelowThresholdFilter(val);
  }

  protected onSearch(val: string): void {
    this.store.onSearch(val);
  }

  protected clearSearch(): void {
    this.store.onSearch('');
  }
}
