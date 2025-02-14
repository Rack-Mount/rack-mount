import { Component, Input } from '@angular/core';
import { RackUnit } from '../../../core/api/v1';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-device',
  imports: [NgIf],
  templateUrl: './device.component.html',
  styleUrl: './device.component.scss',
})
export class DeviceComponent {
  @Input() device: RackUnit | undefined;
  @Input() position: number | undefined;
  hostname_visible: boolean = false;
}
