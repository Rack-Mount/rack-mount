import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../../../../environments/environment';
import { AssetState, AssetType } from '../../../../../core/api/v1';
import { RoleService } from '../../../../../core/services/role.service';

export interface AssetsFilterParams {
  search: string;
  stateId: number | null;
  typeId: number | null;
}

export type CsvImportState = 'idle' | 'importing' | 'success' | 'error';

export interface CsvImportRow {
  row: number;
  hostname: string;
  serial_number: string;
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
  protected readonly role = inject(RoleService);
  readonly params = input<AssetsFilterParams>({
    search: '',
    stateId: null,
    typeId: null,
  });
  readonly availableStates = input<AssetState[]>([]);
  readonly availableTypes = input<AssetType[]>([]);
  readonly totalCount = input<number | null>(null);
  readonly importCsvState = input<CsvImportState>('idle');
  readonly importCsvSummary = input('');
  readonly importCsvErrors = input<{ row: number; message: string }[]>([]);
  readonly importCsvRows = input<CsvImportRow[]>([]);

  readonly importCsvDismiss = output<void>();
  readonly searchChange = output<string>();
  readonly stateFilterChange = output<number | null>();
  readonly typeFilterChange = output<number | null>();
  readonly filtersReset = output<void>();
  readonly newClick = output<void>();
  readonly importCsvFile = output<File>();

  protected readonly showPanel = signal(false);

  protected readonly hasFilters = computed(() => {
    const p = this.params();
    return !!(p.search || p.stateId || p.typeId);
  });

  constructor() {
    // Close import panel automatically when state resets to idle
    effect(() => {
      if (this.importCsvState() === 'idle') this.showPanel.set(false);
    });
  }

  toggleErrors(): void {
    this.showPanel.update((v) => !v);
  }

  dismissErrors(): void {
    this.showPanel.set(false);
    this.importCsvDismiss.emit();
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
