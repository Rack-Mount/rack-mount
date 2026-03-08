import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RackCreateDrawerComponent } from './rack-create-drawer/rack-create-drawer.component';
import { RacksListStore } from './racks-list.store';
import { RacksTableComponent } from './racks-table/racks-table.component';
import { RacksToolbarComponent } from './racks-toolbar/racks-toolbar.component';

@Component({
  selector: 'app-racks-list',
  standalone: true,
  imports: [
    RacksToolbarComponent,
    RacksTableComponent,
    RackCreateDrawerComponent,
  ],
  providers: [RacksListStore],
  templateUrl: './racks-list.component.html',
  styleUrl: './racks-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RacksListComponent {
  protected readonly store = inject(RacksListStore);
}
