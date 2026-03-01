import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../../../../environments/environment';
import { AssetState, AssetType } from '../../../../../core/api/v1';

export interface AssetsFilterParams {
  search: string;
  stateId: number | null;
  typeId: number | null;
}

export type CsvImportState = 'idle' | 'importing' | 'success' | 'error';

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
  @Input() set importCsvState(v: CsvImportState) {
    this._importCsvState = v;
    if (v === 'idle') this.showErrors = false;
  }
  get importCsvState(): CsvImportState {
    return this._importCsvState;
  }
  private _importCsvState: CsvImportState = 'idle';

  @Input() importCsvSummary = '';
  @Input() importCsvErrors: { row: number; message: string }[] = [];

  protected showErrors = false;

  toggleErrors(): void {
    this.showErrors = !this.showErrors;
  }

  dismissErrors(): void {
    this.showErrors = false;
    this.importCsvDismiss.emit();
  }

  @Output() importCsvDismiss = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() stateFilterChange = new EventEmitter<number | null>();
  @Output() typeFilterChange = new EventEmitter<number | null>();
  @Output() filtersReset = new EventEmitter<void>();
  @Output() newClick = new EventEmitter<void>();
  @Output() importCsvFile = new EventEmitter<File>();

  get hasFilters(): boolean {
    return !!(this.params.search || this.params.stateId || this.params.typeId);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.importCsvFile.emit(file);
  }

  downloadTemplate(): void {
    const url = `${environment.service_url}/asset/asset/import-csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'asset_import_template.csv';
    a.click();
  }
}
