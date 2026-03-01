import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Rack, RackType } from '../../../../../core/api/v1';
import { DeleteState, ListState } from '../racks.types';

@Component({
  selector: 'app-racks-table',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './racks-table.component.html',
  styleUrl: './racks-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RacksTableComponent {
  @Input() listState: ListState = { status: 'loading' };
  @Input() ordering = 'name';
  @Input() deleteState: DeleteState = { id: 'none' };
  @Input() searchQuery = '';

  @Output() sort = new EventEmitter<string>();
  @Output() openVisualizer = new EventEmitter<Rack>();
  @Output() openPreview = new EventEmitter<Rack>();
  @Output() edit = new EventEmitter<Rack>();
  @Output() deleteRequest = new EventEmitter<Rack>();
  @Output() deleteConfirm = new EventEmitter<Rack>();
  @Output() deleteCancel = new EventEmitter<void>();

  protected sortDir(field: string): 'asc' | 'desc' | null {
    if (this.ordering === field) return 'asc';
    if (this.ordering === `-${field}`) return 'desc';
    return null;
  }

  protected capacityLabel(model: RackType): string {
    return `${model.capacity}U`;
  }

  protected usedUnits(rack: Rack): number {
    return rack.used_units ?? 0;
  }

  protected occupancyPercent(rack: Rack): number {
    const cap = rack.model?.capacity;
    if (!cap) return 0;
    return Math.round(((rack.used_units ?? 0) / cap) * 100);
  }

  protected occupancyClass(rack: Rack): string {
    const pct = this.occupancyPercent(rack);
    if (pct >= 90) return 'occ--critical';
    if (pct >= 70) return 'occ--warn';
    return 'occ--ok';
  }

  protected totalPowerWatt(rack: Rack): number {
    return rack.total_power_watt ?? 0;
  }

  protected formatPower(rack: Rack): string {
    const w = this.totalPowerWatt(rack);
    if (w >= 1000) return `${(w / 1000).toFixed(1).replace('.0', '')} kW`;
    return `${w} W`;
  }
}
