import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  LocationService,
  Rack,
  RackType,
  Room,
} from '../../../../../core/api/v1';

@Component({
  selector: 'app-rack-create-drawer',
  standalone: true,
  imports: [TranslatePipe, FormsModule],
  templateUrl: './rack-create-drawer.component.html',
  styleUrl: './rack-create-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackCreateDrawerComponent implements OnInit {
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Inputs ─────────────────────────────────────────────────────────────────
  readonly mode = input.required<'create' | 'edit'>();
  readonly rack = input<Rack | null>(null);
  /** When a new RackType is created while this drawer is open, inject it here. */
  readonly latestRackType = input<RackType | null>(null);

  // ── Outputs ────────────────────────────────────────────────────────────────
  readonly saved = output<Rack>();
  readonly cancelled = output<void>();

  // ── Form state ─────────────────────────────────────────────────────────────
  protected readonly form = signal({
    name: '',
    model_id: null as number | null,
    room_id: null as number | null,
  });

  protected readonly saveState = signal<'idle' | 'saving' | 'error'>('idle');
  protected readonly saveMsg = signal('');

  // ── Reference data ─────────────────────────────────────────────────────────
  protected readonly rackTypes = signal<RackType[]>([]);
  protected readonly rooms = signal<Room[]>([]);
  protected readonly refLoading = signal(true);

  constructor() {
    // Whenever a new RackType arrives from the parent, prepend it to the list
    effect(() => {
      const rt = this.latestRackType();
      if (rt == null) return;
      this.rackTypes.update((list) =>
        list.some((r) => r.id === rt.id) ? list : [rt, ...list],
      );
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // Pre-fill form when editing
    const existing = this.rack();
    if (existing && this.mode() === 'edit') {
      this.form.set({
        name: existing.name,
        model_id: existing.model_id ?? existing.model?.id ?? null,
        room_id: existing.room_id ?? null,
      });
    }

    // Load reference lists in parallel
    forkJoin({
      types: this.locationService.locationRackTypeList({ pageSize: 500 }),
      rooms: this.locationService.locationRoomList({ pageSize: 500 }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ types, rooms }) => {
          this.rackTypes.set(types.results ?? []);
          const roomResults = rooms.results ?? [];
          this.rooms.set(roomResults);
          this.refLoading.set(false);
        },
        error: () => {
          this.refLoading.set(false);
        },
      });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  protected onFieldChange<K extends keyof ReturnType<typeof this.form>>(
    key: K,
    value: ReturnType<typeof this.form>[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected onSubmit(): void {
    const f = this.form();
    if (!f.name.trim() || f.model_id == null || f.room_id == null) {
      this.saveState.set('error');
      this.saveMsg.set('racks.field_required');
      return;
    }

    this.saveState.set('saving');
    this.saveMsg.set('');

    const payload = {
      name: f.name.trim(),
      model_id: f.model_id,
      room_id: f.room_id,
    };

    const op$ =
      this.mode() === 'edit'
        ? this.locationService.locationRackPartialUpdate({
            name: this.rack()!.name,
            patchedRack: payload,
          })
        : this.locationService.locationRackCreate({ rack: payload as any });

    op$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.saveState.set('idle');
        this.saved.emit(result as Rack);
      },
      error: (err: HttpErrorResponse) => {
        this.saveState.set('error');
        const detail =
          err.error?.name?.[0] ??
          err.error?.detail ??
          err.error?.non_field_errors?.[0] ??
          'racks.save_error';
        this.saveMsg.set(detail);
      },
    });
  }
}
