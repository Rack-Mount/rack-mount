import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { AssetState } from '../../../../core/api/v1';
import { EditState, stateColor } from '../assets-list-utils';

@Component({
  selector: 'app-asset-state-picker',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './asset-state-picker.component.html',
  styleUrl: './asset-state-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetStatePickerComponent {
  readonly states = input.required<AssetState[]>();
  readonly x = input.required<number>();
  readonly y = input.required<number>();
  readonly editState = input.required<EditState>();
  /** If provided (> 0), shows bulk hint with count instead of single "Salvataggio…" */
  readonly bulkCount = input<number | null>(null);

  readonly picked = output<number>();
  readonly closed = output();

  protected readonly stateColor = stateColor;
}
