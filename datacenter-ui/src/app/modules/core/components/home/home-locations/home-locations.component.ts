import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Location as DjLocation } from '../../../api/v1/model/location';

export interface RoomOpenEvent {
  id: number;
  name: string;
}

@Component({
  selector: 'app-home-locations',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-locations.component.html',
  styleUrl: './home-locations.component.scss',
})
export class HomeLocationsComponent {
  readonly loading = input.required<boolean>();
  readonly locations = input.required<DjLocation[]>();

  readonly roomOpen = output<RoomOpenEvent>();
  readonly assetsOpen = output<void>();

  protected onRoomClick(id: number, name: string): void {
    this.roomOpen.emit({ id, name });
  }

  protected onAssetsClick(): void {
    this.assetsOpen.emit();
  }
}
