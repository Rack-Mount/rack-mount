import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../../../environments/environment';
import { RackUnit } from '../../../../core/api/v1';
import { MediaUrlService } from '../../../../core/services/media-url.service';
import { RoleService } from '../../../../core/services/role.service';

const TYPE_CLASS_MAP: Record<string, string> = {
  cable_manager: 'cable-manager',
  blanking_panel: 'blanking',
  patch_panel: 'patch',
  pdu: 'pdu',
  shelf: 'shelf',
  other: 'other',
};

const TYPE_ICON_MAP: Record<string, string> = {
  cable_manager: '⬛',
  blanking_panel: '▬',
  patch_panel: '🔌',
  pdu: '⚡',
  shelf: '📦',
  other: '⚙',
};

@Component({
  selector: 'app-generic-component-slot',
  imports: [TranslatePipe],
  templateUrl: './generic-component-slot.component.html',
  styleUrl: './generic-component-slot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericComponentSlotComponent {
  /** RackUnit that holds the generic component. */
  readonly rackUnit = input.required<RackUnit>();

  /** True when the rack is shown from the rear face. */
  readonly rearView = input<boolean>(false);

  /** Emitted when the user requests removal of this slot (no stock return). */
  readonly removeRequest = output<{
    rackUnitId: number;
    anchorX: number;
    anchorY: number;
  }>();

  /** Emitted when the user requests removal and stock return. */
  readonly returnToStockRequest = output<{ rackUnitId: number }>();

  protected readonly role = inject(RoleService);
  protected readonly serviceUrl = environment.service_url;
  private readonly mediaUrlService = inject(MediaUrlService);

  /** True when the inline "return to stock?" dialog is visible. */
  protected readonly _showReturnDialog = signal(false);

  /** Cached anchor coordinates for when the remove dialog is resolved. */
  private _pendingAnchorX = 0;
  private _pendingAnchorY = 0;

  protected readonly typeClass = computed(() => {
    const t = this.rackUnit().generic_component_type ?? '';
    return TYPE_CLASS_MAP[t] ?? 'other';
  });

  protected readonly typeIcon = computed(() => {
    const t = this.rackUnit().generic_component_type ?? '';
    return TYPE_ICON_MAP[t] ?? '⚙';
  });

  /** The image path to display: rear when in rear view, front otherwise. Falls back to the other face. */
  protected readonly activeImage = computed(() => {
    const ru = this.rackUnit();
    if (this.rearView()) {
      return (
        ru.generic_component_rear_image ||
        ru.generic_component_front_image ||
        null
      );
    }
    return (
      ru.generic_component_front_image ||
      ru.generic_component_rear_image ||
      null
    );
  });

  protected readonly activeImageUrl = toSignal(
    toObservable(this.activeImage).pipe(
      switchMap((img) =>
        img ? this.mediaUrlService.resolveImageUrl(img, 320) : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected onRemove(event: MouseEvent): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (this.rackUnit().generic_component_warehouse_item_id != null) {
      this._pendingAnchorX = rect.right + 8;
      this._pendingAnchorY = rect.top;
      this._showReturnDialog.set(true);
    } else {
      this.removeRequest.emit({
        rackUnitId: this.rackUnit().id,
        anchorX: rect.right + 8,
        anchorY: rect.top,
      });
    }
  }

  protected onDialogReturnToStock(event: MouseEvent): void {
    event.stopPropagation();
    this._showReturnDialog.set(false);
    this.returnToStockRequest.emit({ rackUnitId: this.rackUnit().id });
  }

  protected onDialogRemoveOnly(event: MouseEvent): void {
    event.stopPropagation();
    this._showReturnDialog.set(false);
    this.removeRequest.emit({
      rackUnitId: this.rackUnit().id,
      anchorX: this._pendingAnchorX,
      anchorY: this._pendingAnchorY,
    });
  }

  protected onDialogCancel(event: MouseEvent): void {
    event.stopPropagation();
    this._showReturnDialog.set(false);
  }
}
