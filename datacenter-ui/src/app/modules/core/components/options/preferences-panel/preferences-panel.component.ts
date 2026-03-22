import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  MeasurementSystemSetting,
  SettingsService,
} from '../../../services/settings.service';

@Component({
  selector: 'app-preferences-panel',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './preferences-panel.component.html',
  styleUrl: './preferences-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreferencesPanelComponent {
  private readonly settings = inject(SettingsService);

  protected readonly unitsSetting = this.settings.measurementSystemSetting;

  protected setUnits(value: MeasurementSystemSetting): void {
    this.settings.setMeasurementSystem(value);
  }
}
