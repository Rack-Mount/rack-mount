import { inject, Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  MeasurementSystem,
  SettingsService,
} from '../services/settings.service';

export type MeasurementType =
  | 'distance'
  | 'area'
  | 'angle'
  | 'dimension'
  | 'weight';

/** Languages whose default measurement system is imperial (US English). */
const IMPERIAL_LANGS = new Set(['en']);

/**
 * Formats a measurement value according to the user's measurement system
 * preference (metric / imperial / auto).
 *
 * Values must be passed already converted to the base SI unit:
 *   distance → metres (m)
 *   area     → square metres (m²)
 *   angle    → degrees (°)
 *
 * Usage:
 *   {{ seg.length / 100 | unitFmt: 'distance' }}   →  "12.34 m"  or  "40.49 ft"
 *   {{ room.area / 10000 | unitFmt: 'area' }}       →  "5.20 m²"  or  "55.97 ft²"
 *   {{ angle | unitFmt: 'angle' }}                  →  "90°"
 */
@Pipe({ name: 'unitFmt', standalone: true, pure: false })
export class MeasurementPipe implements PipeTransform {
  private readonly settings = inject(SettingsService);
  private readonly translate = inject(TranslateService);

  private get effectiveSystem(): MeasurementSystem {
    const setting = this.settings.measurementSystemSetting();
    if (setting !== 'auto') return setting;
    return IMPERIAL_LANGS.has(this.translate.currentLang)
      ? 'imperial'
      : 'metric';
  }

  transform(
    value: number | string | null | undefined,
    type: MeasurementType = 'distance',
  ): string {
    const num = value == null ? null : Number(value);
    if (num == null || Number.isNaN(num)) return '';

    if (type === 'angle') {
      return `${Math.round(num)}°`;
    }

    if (type === 'dimension') {
      if (this.effectiveSystem === 'imperial')
        return `${(num * 0.0393701).toFixed(2)}"`;
      return `${num} mm`;
    }

    if (type === 'weight') {
      if (this.effectiveSystem === 'imperial')
        return `${(num * 2.20462).toFixed(2)} lb`;
      return `${num} kg`;
    }

    if (this.effectiveSystem === 'imperial') {
      if (type === 'distance') {
        return `${(num * 3.28084).toFixed(2)} ft`;
      }
      return `${(num * 10.7639).toFixed(2)} ft²`;
    }

    // metric
    if (type === 'distance') return `${num.toFixed(2)} m`;
    return `${num.toFixed(2)} m²`;
  }
}
