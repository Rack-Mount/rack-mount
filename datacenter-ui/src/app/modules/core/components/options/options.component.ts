import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ChangePasswordPanelComponent } from './change-password-panel/change-password-panel.component';
import { PreferencesPanelComponent } from './preferences-panel/preferences-panel.component';

@Component({
  selector: 'app-options',
  standalone: true,
  imports: [PreferencesPanelComponent, ChangePasswordPanelComponent],
  templateUrl: './options.component.html',
  styleUrl: './options.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionsComponent {}
