import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoleService } from '../../../../core/services/role.service';
import { WarehouseInventoryStore } from '../warehouse-inventory.store';

@Component({
  selector: 'app-warehouse-table',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './warehouse-table.component.html',
  styleUrl: './warehouse-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarehouseTableComponent {
  protected readonly role = inject(RoleService);
  protected readonly store = inject(WarehouseInventoryStore);

  protected sortDir(field: string): 'asc' | 'desc' | null {
    return this.store.sortDir(field);
  }

  protected formatQuantity(item: { quantity?: string; unit_display: string }): string {
    return `${item.quantity ?? '0'} ${item.unit_display}`;
  }
}
