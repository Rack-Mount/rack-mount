import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Location as DjLocation } from '../../../../../core/api/v1/model/location';
import { RackType } from '../../../../../core/api/v1/model/rackType';
import { Room as DjRoom } from '../../../../../core/api/v1/model/room';

/**
 * Presentational toolbar component rendered above the map SVG canvas.
 * It surfaces location/room selectors, the save button, the autosave toggle,
 * and tool-specific controls (rack model picker, door width).
 */
@Component({
  selector: 'app-map-floor-plan-toolbar',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './map-floor-plan-toolbar.component.html',
  styleUrl: './map-floor-plan-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapFloorPlanToolbarComponent {
  // ── Inputs ─────────────────────────────────────────────────────────────────

  /**
   * When set, the toolbar shows static location/room labels instead of selects
   * (used when the map is opened as a tab pre-loaded to a specific room).
   */
  readonly roomId = input<number | undefined>(undefined);

  readonly locations = input<DjLocation[]>([]);
  readonly selectedLocationId = input<number | null>(null);
  readonly rooms = input<DjRoom[]>([]);
  readonly selectedRoomId = input<number | null>(null);

  readonly saveStatus = input<'idle' | 'saving' | 'saved' | 'error'>('idle');
  readonly autosave = input<boolean>(false);

  readonly activeTool = input<string>('select');
  readonly rackTypes = input<RackType[]>([]);
  readonly selectedRackType = input<RackType | null>(null);
  readonly doorWidth = input<number>(100);

  // ── Outputs ────────────────────────────────────────────────────────────────

  readonly locationChange = output<number | null>();
  readonly roomChange = output<number | null>();
  readonly save = output<void>();
  readonly autosaveChange = output<boolean>();
  readonly rackTypeChange = output<RackType | null>();
  readonly doorWidthChange = output<number>();

  // ── Derived display values ─────────────────────────────────────────────────

  readonly selectedLocationName = computed(
    () =>
      this.locations().find((l) => l.id === this.selectedLocationId())?.name ??
      '',
  );

  readonly selectedRoomName = computed(
    () => this.rooms().find((r) => r.id === this.selectedRoomId())?.name ?? '',
  );
}
