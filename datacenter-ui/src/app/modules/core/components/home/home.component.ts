import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocationService } from '../../api/v1/api/location.service';
import { Location as DjLocation } from '../../api/v1/model/location';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  locations: DjLocation[] = [];
  totalRooms = 0;
  loading = true;

  constructor(
    private locationService: LocationService,
    private cdr: ChangeDetectorRef,
  ) {}

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
}
