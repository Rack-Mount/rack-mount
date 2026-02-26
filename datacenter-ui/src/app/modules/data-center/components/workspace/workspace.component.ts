import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MapComponent } from '../map/map.component';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [MapComponent],
  template: `<app-map />`,
  styles: [
    ':host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceComponent {}
