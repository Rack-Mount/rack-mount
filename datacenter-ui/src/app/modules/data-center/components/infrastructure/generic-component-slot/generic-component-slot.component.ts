import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { environment } from '../../../../../../environments/environment';
import { RackUnit } from '../../../../core/api/v1';
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
  imports: [],
  templateUrl: './generic-component-slot.component.html',
  styleUrl: './generic-component-slot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericComponentSlotComponent {
  /** RackUnit that holds the generic component. */
  readonly rackUnit = input.required<RackUnit>();

  /** True when the rack is shown from the rear face. */
  readonly rearView = input<boolean>(false);

  /** Emitted when the user requests removal of this slot. */
  readonly removeRequest = output<{
    rackUnitId: number;
    anchorX: number;
    anchorY: number;
  }>();

  protected readonly role = inject(RoleService);
  protected readonly serviceUrl = environment.service_url;

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

  protected onRemove(event: MouseEvent): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.removeRequest.emit({
      rackUnitId: this.rackUnit().id,
      anchorX: rect.right + 8,
      anchorY: rect.top,
    });
  }
}
