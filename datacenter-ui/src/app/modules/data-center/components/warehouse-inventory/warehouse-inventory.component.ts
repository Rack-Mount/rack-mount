import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WarehouseAdjustDialogComponent } from './warehouse-adjust-dialog/warehouse-adjust-dialog.component';
import { WarehouseInventoryStore } from './warehouse-inventory.store';
import { WarehouseItemDrawerComponent } from './warehouse-item-drawer/warehouse-item-drawer.component';
import { WarehouseTableComponent } from './warehouse-table/warehouse-table.component';
import { WarehouseToolbarComponent } from './warehouse-toolbar/warehouse-toolbar.component';

@Component({
  selector: 'app-warehouse-inventory',
  standalone: true,
  imports: [
    WarehouseToolbarComponent,
    WarehouseTableComponent,
    WarehouseItemDrawerComponent,
    WarehouseAdjustDialogComponent,
  ],
  providers: [WarehouseInventoryStore],
  templateUrl: './warehouse-inventory.component.html',
  styleUrl: './warehouse-inventory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarehouseInventoryComponent {
  protected readonly store = inject(WarehouseInventoryStore);
}
