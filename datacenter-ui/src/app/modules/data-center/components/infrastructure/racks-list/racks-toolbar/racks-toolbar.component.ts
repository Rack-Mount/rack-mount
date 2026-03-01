import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Location, Room } from '../../../../../core/api/v1';

@Component({
  selector: 'app-racks-toolbar',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './racks-toolbar.component.html',
  styleUrl: './racks-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RacksToolbarComponent {
  @Input() locations: Location[] = [];
  @Input() filteredRooms: Room[] = [];
  @Input() locationFilter: number | null = null;
  @Input() roomFilter: number | null = null;
  @Input() searchQuery = '';
  @Input() itemCount: number | null = null;

  @Output() locationFilterChange = new EventEmitter<number | null>();
  @Output() roomFilterChange = new EventEmitter<number | null>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() newClick = new EventEmitter<void>();

  protected onLocationFilter(val: string): void {
    this.locationFilterChange.emit(val ? +val : null);
  }

  protected onRoomFilter(val: string): void {
    this.roomFilterChange.emit(val ? +val : null);
  }

  protected onSearch(val: string): void {
    this.searchChange.emit(val);
  }

  protected clearSearch(): void {
    this.searchChange.emit('');
  }
}
