import { Injectable, signal } from '@angular/core';

const LS_AUTOSAVE_KEY = 'dc:autosave';
const LS_UNITS_KEY = 'dc:units';

export type MeasurementSystem = 'metric' | 'imperial';
export type MeasurementSystemSetting = 'auto' | MeasurementSystem;

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _autosave = signal<boolean>(
    localStorage.getItem(LS_AUTOSAVE_KEY) === 'true',
  );

  readonly autosave = this._autosave.asReadonly();

  setAutosave(value: boolean): void {
    this._autosave.set(value);
    try {
      localStorage.setItem(LS_AUTOSAVE_KEY, String(value));
    } catch {
      /* ignore */
    }
  }

  private readonly _measurementSystem = signal<MeasurementSystemSetting>(
    (localStorage.getItem(LS_UNITS_KEY) as MeasurementSystemSetting) ?? 'auto',
  );

  readonly measurementSystemSetting = this._measurementSystem.asReadonly();

  setMeasurementSystem(value: MeasurementSystemSetting): void {
    this._measurementSystem.set(value);
    try {
      localStorage.setItem(LS_UNITS_KEY, value);
    } catch {
      /* ignore */
    }
  }
}
