import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-home-stats',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-stats.component.html',
  styleUrl: './home-stats.component.scss',
})
export class HomeStatsComponent {
  readonly locationCount = input.required<number>();
  readonly totalRooms = input.required<number>();
}
