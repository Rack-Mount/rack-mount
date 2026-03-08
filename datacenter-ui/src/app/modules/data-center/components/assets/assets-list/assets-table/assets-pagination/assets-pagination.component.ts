import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AssetsListStore } from '../../assets-list.store';

@Component({
  selector: 'app-assets-pagination',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './assets-pagination.component.html',
  styleUrl: './assets-pagination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsPaginationComponent {
  protected readonly store = inject(AssetsListStore);
}
