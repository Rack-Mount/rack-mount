import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AssetState, AssetType } from '../../../../../core/api/v1';

export interface AssetsFilterParams {
  search: string;
  stateId: number | null;
  typeId: number | null;
}

@Component({
  selector: 'app-assets-toolbar',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './assets-toolbar.component.html',
  styleUrl: './assets-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsToolbarComponent {
  @Input() params: AssetsFilterParams = {
    search: '',
    stateId: null,
    typeId: null,
  };
  @Input() availableStates: AssetState[] = [];
  @Input() availableTypes: AssetType[] = [];
  /** null = list not yet loaded — hides the count badge */
  @Input() totalCount: number | null = null;

  @Output() searchChange = new EventEmitter<string>();
  @Output() stateFilterChange = new EventEmitter<number | null>();
  @Output() typeFilterChange = new EventEmitter<number | null>();
  @Output() filtersReset = new EventEmitter<void>();
  @Output() newClick = new EventEmitter<void>();

  get hasFilters(): boolean {
    return !!(this.params.search || this.params.stateId || this.params.typeId);
  }
}
