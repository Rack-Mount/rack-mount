import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoleService } from '../../../../../../core/services/role.service';
import { AssetsListStore } from '../../assets-list.store';

@Component({
  selector: 'app-assets-bulk-bar',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './assets-bulk-bar.component.html',
  styleUrl: './assets-bulk-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsBulkBarComponent {
  protected readonly store = inject(AssetsListStore);
  protected readonly role = inject(RoleService);

  protected openBulkPicker(event: MouseEvent): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pickerW = 200;
    const pickerH = 280;
    const idealX = rect.left;
    const x =
      idealX + pickerW > window.innerWidth - 4 ? rect.right - pickerW : idealX;
    const idealY = rect.bottom + 6;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - pickerH - 4));
    this.store.onBulkPickerOpen({ x, y });
  }
}
