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
import { LocationService, RackType } from '../../../../../core/api/v1';

@Component({
  selector: 'app-rack-model-create-drawer',
  standalone: true,
  imports: [TranslatePipe, FormsModule],
  templateUrl: './rack-model-create-drawer.component.html',
  styleUrl: './rack-model-create-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackModelCreateDrawerComponent implements OnInit {
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Inputs ─────────────────────────────────────────────────────────────────
  readonly mode = input<'create' | 'edit'>('create');
  readonly rackType = input<RackType | null>(null);

  // ── Outputs ────────────────────────────────────────────────────────────────
  readonly saved = output<RackType>();
  readonly cancelled = output<void>();

  // ── Form state ─────────────────────────────────────────────────────────────
  protected readonly form = signal({
    model: '',
    width: null as number | null,
    height: null as number | null,
    depth: null as number | null,
    capacity: null as number | null,
  });

  protected readonly saveState = signal<'idle' | 'saving' | 'error'>('idle');
  protected readonly saveMsg = signal('');

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const existing = this.rackType();
    if (existing && this.mode() === 'edit') {
      this.form.set({
        model: existing.model,
        width: existing.width,
        height: existing.height ?? null,
        depth: existing.depth,
        capacity: existing.capacity,
      });
    }
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
    if (
      !f.model.trim() ||
      f.width == null ||
      f.depth == null ||
      f.capacity == null
    ) {
      this.saveState.set('error');
      this.saveMsg.set('rack_models.field_required');
      return;
    }

    this.saveState.set('saving');
    this.saveMsg.set('');

    const payload = {
      model: f.model.trim(),
      width: f.width,
      height: f.height ?? undefined,
      depth: f.depth,
      capacity: f.capacity,
    };

    const op$ =
      this.mode() === 'edit'
        ? this.locationService.locationRackTypePartialUpdate({
            id: this.rackType()!.id,
            patchedRackType: payload as any,
          })
        : this.locationService.locationRackTypeCreate({
            rackType: payload as RackType,
          });

    op$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result: RackType) => {
        this.saveState.set('idle');
        this.saved.emit(result);
      },
      error: (err: HttpErrorResponse) => {
        this.saveState.set('error');
        const detail =
          err.error?.model?.[0] ??
          err.error?.detail ??
          err.error?.non_field_errors?.[0] ??
          'rack_models.save_error';
        this.saveMsg.set(detail);
      },
    });
  }
}
