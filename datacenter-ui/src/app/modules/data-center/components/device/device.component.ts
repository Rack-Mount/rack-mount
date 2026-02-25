import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RackUnit } from '../../../core/api/v1';

@Component({
  selector: 'app-device',
  imports: [],
  templateUrl: './device.component.html',
  styleUrl: './device.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceComponent {
  @Input() device: RackUnit | undefined;
  @Input() position: number | undefined;
  protected hostnameVisible = false;
}
