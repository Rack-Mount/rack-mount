import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-home-stats',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-stats.component.html',
  styleUrl: './home-stats.component.scss',
})
export class HomeStatsComponent {
  readonly locationCount = input.required<number>();
  readonly totalRooms = input.required<number>();
}
