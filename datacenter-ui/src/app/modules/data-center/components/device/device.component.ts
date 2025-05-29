import { Component, Input } from '@angular/core';
import { RackUnit } from '../../../core/api/v1';


@Component({
  selector: 'app-device',
  imports: [],
  templateUrl: './device.component.html',
  styleUrl: './device.component.scss',
})
export class DeviceComponent {
  @Input() device: RackUnit | undefined;
  @Input() position: number | undefined;
  hostname_visible: boolean = false;
}
