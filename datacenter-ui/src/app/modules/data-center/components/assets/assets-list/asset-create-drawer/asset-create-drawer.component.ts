import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AssetModel, AssetService, AssetState } from '../../../../../core/api/v1';

@Component({
  selector: 'app-asset-create-drawer',
  standalone: true,
  imports: [],
  templateUrl: './asset-create-drawer.component.html',
  styleUrl: './asset-create-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetCreateDrawerComponent {
  private readonly assetService = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);

  readonly availableStates = input.required<AssetState[]>();
  readonly availableModels = input.required<AssetModel[]>();

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
    power_cosumption_watt: null as number | null,
    note: '',
  });

  protected readonly createSaveState = signal<'idle' | 'saving' | 'error'>(
    'idle',
  );

  // ── Model autocomplete ────────────────────────────────────────────────────
  protected readonly modelSearch = signal('');
  protected readonly modelDropdownOpen = signal(false);

  protected readonly filteredModels = computed(() => {
    const q = this.modelSearch().toLowerCase().trim();
    const all = this.availableModels();
    if (!q) return all.slice(0, 25);
    return all
      .filter(
        (m) =>
          (m.name ?? '').toLowerCase().includes(q) ||
          (m.vendor.name ?? '').toLowerCase().includes(q),
      )
      .slice(0, 25);
  });

  // ── Model autocomplete handlers ───────────────────────────────────────────
  protected onModelSearch(value: string): void {
    this.modelSearch.set(value);
    this.modelDropdownOpen.set(true);
    if (!value) this.createForm.update((f) => ({ ...f, model_id: null }));
  }

  protected selectModel(m: AssetModel): void {
    this.createForm.update((f) => ({ ...f, model_id: m.id }));
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
    this.assetService
      .assetAssetCreate({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        asset: {
          model_id: form.model_id,
          state_id: form.state_id,
          hostname: form.hostname || undefined,
          serial_number: form.serial_number || undefined,
          sap_id: form.sap_id || undefined,
          order_id: form.order_id || undefined,
          purchase_date: form.purchase_date || undefined,
          warranty_expiration: form.warranty_expiration || undefined,
          support_expiration: form.support_expiration || undefined,
          decommissioned_date: form.decommissioned_date || undefined,
          power_supplies: form.power_supplies ?? undefined,
          power_cosumption_watt: form.power_cosumption_watt ?? undefined,
          note: form.note || undefined,
        } as any,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.createSaveState.set('idle');
          this.saved.emit();
        },
        error: () => this.createSaveState.set('error'),
      });
  }
}
