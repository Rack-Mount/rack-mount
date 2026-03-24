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
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  CategoryEnum,
  LocationService,
  Room,
  UnitEnum,
  WarehouseItem,
} from '../../../../core/api/v1';

@Component({
  selector: 'app-warehouse-item-drawer',
  standalone: true,
  imports: [TranslatePipe, FormsModule],
  templateUrl: './warehouse-item-drawer.component.html',
  styleUrl: './warehouse-item-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarehouseItemDrawerComponent implements OnInit {
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = input.required<'create' | 'edit'>();
  readonly item = input<WarehouseItem | null>(null);

  readonly saved = output<WarehouseItem>();
  readonly cancelled = output<void>();

  protected readonly form = signal({
    name: '',
    category: CategoryEnum.Other as string,
    specs: '',
    quantity: '0',
    unit: UnitEnum.Pcs as string,
    min_threshold: '' as string,
    warehouse: null as number | null,
    notes: '',
  });

  protected readonly saveState = signal<'idle' | 'saving' | 'error'>('idle');
  protected readonly saveMsg = signal('');
  protected readonly rooms = signal<Room[]>([]);
  protected readonly refLoading = signal(true);

  readonly categories = [
    { value: CategoryEnum.Cable, labelKey: 'warehouse.cat_cable' },
    { value: CategoryEnum.Fiber, labelKey: 'warehouse.cat_fiber' },
    { value: CategoryEnum.SfpSwitch, labelKey: 'warehouse.cat_sfp_switch' },
    { value: CategoryEnum.SfpServer, labelKey: 'warehouse.cat_sfp_server' },
    { value: CategoryEnum.CableManager, labelKey: 'warehouse.cat_cable_manager' },
    { value: CategoryEnum.Other, labelKey: 'warehouse.cat_other' },
  ];

  readonly units = [
    { value: UnitEnum.Pcs, labelKey: 'warehouse.unit_pcs' },
    { value: UnitEnum.M, labelKey: 'warehouse.unit_m' },
    { value: UnitEnum.Box, labelKey: 'warehouse.unit_box' },
  ];

  ngOnInit(): void {
    const existing = this.item();
    if (existing && this.mode() === 'edit') {
      this.form.set({
        name: existing.name,
        category: existing.category ?? CategoryEnum.Other,
        specs: existing.specs ?? '',
        quantity: existing.quantity ?? '0',
        unit: existing.unit ?? UnitEnum.Pcs,
        min_threshold: existing.min_threshold ?? '',
        warehouse: existing.warehouse,
        notes: existing.notes ?? '',
      });
    }

    this.locationService
      .locationRoomList({ pageSize: 500 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          // Only warehouse-type rooms
          this.rooms.set(
            (res.results ?? []).filter((r) => (r as any).room_type === 'warehouse'),
          );
          this.refLoading.set(false);
        },
        error: () => this.refLoading.set(false),
      });
  }

  protected onFieldChange<K extends keyof ReturnType<typeof this.form>>(
    key: K,
    value: ReturnType<typeof this.form>[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected onSubmit(): void {
    const f = this.form();
    if (!f.name.trim() || f.warehouse == null) {
      this.saveState.set('error');
      this.saveMsg.set('warehouse.field_required');
      return;
    }

    this.saveState.set('saving');
    this.saveMsg.set('');

    const payload: any = {
      name: f.name.trim(),
      category: f.category,
      specs: f.specs.trim(),
      quantity: f.quantity || '0',
      unit: f.unit,
      min_threshold: f.min_threshold ? f.min_threshold : null,
      warehouse: f.warehouse,
      notes: f.notes.trim(),
    };

    const op$ =
      this.mode() === 'edit'
        ? this.locationService.locationWarehouseItemPartialUpdate({
            id: this.item()!.id,
            patchedWarehouseItem: payload,
          })
        : this.locationService.locationWarehouseItemCreate({
            warehouseItem: payload,
          });

    op$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.saveState.set('idle');
        this.saved.emit(result as WarehouseItem);
      },
      error: (err: HttpErrorResponse) => {
        this.saveState.set('error');
        const detail =
          err.error?.name?.[0] ??
          err.error?.detail ??
          err.error?.non_field_errors?.[0] ??
          'warehouse.save_error';
        this.saveMsg.set(detail);
      },
    });
  }
}
