import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { LocationService } from '../../api/v1/api/location.service';
import { Location as DjLocation } from '../../api/v1/model/location';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private readonly tabService = inject(TabService);
  private readonly locationService = inject(LocationService);
  private readonly cdr = inject(ChangeDetectorRef);

  locations: DjLocation[] = [];
  totalRooms = 0;
  loading = true;

  ngOnInit(): void {
    this.locationService.locationLocationList({}).subscribe({
      next: (data) => {
        this.locations = data.results ?? [];
        this.totalRooms = this.locations.reduce(
          (sum, loc) => sum + (loc.rooms?.length ?? 0),
          0,
        );
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  openRoom(roomId: number, roomName: string): void {
    this.tabService.openRoom(roomId, roomName);
  }
}
