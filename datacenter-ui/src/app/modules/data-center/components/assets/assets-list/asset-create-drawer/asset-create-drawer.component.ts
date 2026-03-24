import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import {
  Asset,
  AssetModel,
  AssetService,
  AssetState,
} from '../../../../../core/api/v1';
import { BackendErrorService } from '../../../../../core/services/backend-error.service';

@Component({
  selector: 'app-asset-create-drawer',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './asset-create-drawer.component.html',
  styleUrl: './asset-create-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetCreateDrawerComponent implements OnInit {
  private readonly assetService = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly backendErr = inject(BackendErrorService);

  readonly availableStates = input.required<AssetState[]>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly editAsset = input<Asset | null>(null);

  /** Emitted after a successful save */
  readonly saved = output<void>();
  /** Emitted when the user cancels */
  readonly cancelled = output<void>();

  // ── Form state ────────────────────────────────────────────────────────────
  protected readonly createForm = signal({
    model_id: null as number | null,
    state_id: null as number | null,
    hostname: '',
    serial_number: '',
    sap_id: '',
    order_id: '',
    purchase_date: '',
    warranty_expiration: '',
    support_expiration: '',
    decommissioned_date: '',
    power_supplies: null as number | null,
    power_consumption_watt: null as number | null,
    note: '',
  });

  protected readonly createSaveState = signal<'idle' | 'saving' | 'error'>(
    'idle',
  );
  protected readonly createSaveMsg = signal('');

  // ── Model autocomplete ────────────────────────────────────────────────────
  protected readonly modelSearch = signal('');
  protected readonly modelDropdownOpen = signal(false);
  protected readonly filteredModels = signal<AssetModel[]>([]);
  protected readonly modelsLoading = signal(false);

  private readonly _modelSearch$ = new Subject<string>();

  constructor() {
    this._modelSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          this.modelsLoading.set(true);
          return this.assetService
            .assetAssetModelList({
              search: q || undefined,
              pageSize: 25,
              ordering: 'name',
            })
            .pipe(
              map((r) => r.results ?? []),
              catchError(() => of([] as AssetModel[])),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => {
        this.filteredModels.set(list);
        this.modelsLoading.set(false);
      });
  }

  ngOnInit(): void {
    const a = this.editAsset();
    if (!a || this.mode() !== 'edit') return;
    this.createForm.set({
      model_id: a.model.id,
      state_id: a.state?.id ?? null, // state_id è write-only, l'API ritorna solo state.id
      hostname: a.hostname ?? '',
      serial_number: a.serial_number ?? '',
      sap_id: a.sap_id ?? '',
      order_id: a.order_id ?? '',
      purchase_date: a.purchase_date ?? '',
      warranty_expiration: a.warranty_expiration ?? '',
      support_expiration: a.support_expiration ?? '',
      decommissioned_date: a.decommissioned_date ?? '',
      power_supplies: a.power_supplies ?? null,
      power_consumption_watt: a.power_consumption_watt ?? null,
      note: a.note ?? '',
    });
    this.modelSearch.set(
      `${a.model.name ?? ''} (${a.model.vendor.name})`.trim(),
    );
  }

  // ── Model autocomplete handlers ───────────────────────────────────────────
  protected onModelFocus(): void {
    this.modelDropdownOpen.set(true);
    this._modelSearch$.next(this.modelSearch());
  }

  protected onModelSearch(value: string): void {
    this.modelSearch.set(value);
    this.modelDropdownOpen.set(true);
    this._modelSearch$.next(value);
    if (!value) this.createForm.update((f) => ({ ...f, model_id: null }));
  }

  protected selectModel(m: AssetModel): void {
    this.createForm.update((f) => ({
      ...f,
      model_id: m.id,
      power_consumption_watt: m.power_consumption_watt ?? null,
    }));
    this.modelSearch.set(`${m.name ?? ''} (${m.vendor.name})`.trim());
    this.modelDropdownOpen.set(false);
  }

  protected clearModel(): void {
    this.createForm.update((f) => ({ ...f, model_id: null }));
    this.modelSearch.set('');
    this.modelDropdownOpen.set(false);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected patchForm(key: string, value: any): void {
    this.createForm.update((f) => ({ ...f, [key]: value }));
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  protected submit(): void {
    const form = this.createForm();
    if (!form.model_id || !form.state_id) return;
    this.createSaveState.set('saving');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      model_id: form.model_id,
      state_id: form.state_id,
      hostname: form.hostname || undefined,
      serial_number: form.serial_number || null,
      sap_id: form.sap_id || null,
      order_id: form.order_id,
      purchase_date: form.purchase_date || undefined,
      warranty_expiration: form.warranty_expiration || undefined,
      support_expiration: form.support_expiration || undefined,
      decommissioned_date: form.decommissioned_date || undefined,
      power_supplies: form.power_supplies ?? undefined,
      power_consumption_watt: form.power_consumption_watt ?? undefined,
      note: form.note || undefined,
    };
    if (this.mode() === 'edit') {
      this.assetService
        .assetAssetPartialUpdate({
          id: this.editAsset()!.id,
          patchedAsset: payload,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.createSaveState.set('idle');
            this.saved.emit();
          },
          error: (err: HttpErrorResponse) => {
            this.createSaveState.set('error');
            this.createSaveMsg.set(this.backendErr.parse(err));
          },
        });
    } else {
      this.assetService
        .assetAssetCreate({ asset: payload })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.createSaveState.set('idle');
            this.saved.emit();
          },
          error: (err: HttpErrorResponse) => {
            this.createSaveState.set('error');
            this.createSaveMsg.set(this.backendErr.parse(err));
          },
        });
    }
  }
}
