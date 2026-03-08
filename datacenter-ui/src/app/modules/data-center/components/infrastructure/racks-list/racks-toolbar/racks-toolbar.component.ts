import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoleService } from '../../../../../core/services/role.service';
import { RacksListStore } from '../racks-list.store';

@Component({
  selector: 'app-racks-toolbar',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './racks-toolbar.component.html',
  styleUrl: './racks-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RacksToolbarComponent {
  protected readonly role = inject(RoleService);
  protected readonly store = inject(RacksListStore);

  protected onLocationFilter(val: string): void {
    this.store.onLocationFilter(val ? +val : null);
  }

  protected onRoomFilter(val: string): void {
    this.store.onRoomFilter(val ? +val : null);
  }

  protected onSearch(val: string): void {
    this.store.onSearch(val);
  }

  protected clearSearch(): void {
    this.store.onSearch('');
  }
}
