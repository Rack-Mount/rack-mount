import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-map-zoom-controls',
  imports: [DecimalPipe],
  templateUrl: './map-zoom-controls.component.html',
  styleUrl: './map-zoom-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapZoomControlsComponent {
  readonly zoom = input.required<number>();
  /** When false, the "centre & snap" button is disabled. */
  readonly roomSelected = input<boolean>(false);

  readonly zoomIn = output<void>();
  readonly zoomOut = output<void>();
  readonly resetZoom = output<void>();
  readonly fitToView = output<void>();
  readonly centerAndSnap = output<void>();
}
