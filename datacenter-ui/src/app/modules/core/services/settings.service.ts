import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { environment } from '../../../../environments/environment';

const LS_AUTOSAVE_KEY = 'dc:autosave';
const LS_UNITS_KEY = 'dc:units';

export type MeasurementSystem = 'metric' | 'imperial';
export type MeasurementSystemSetting = 'auto' | MeasurementSystem;

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

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

  /** Called by AuthService to sync the server value after login. */
  loadFromServer(value: MeasurementSystemSetting): void {
    this._measurementSystem.set(value);
    try {
      localStorage.setItem(LS_UNITS_KEY, value);
    } catch {
      /* ignore */
    }
  }

  setMeasurementSystem(value: MeasurementSystemSetting): void {
    this._measurementSystem.set(value);
    try {
      localStorage.setItem(LS_UNITS_KEY, value);
    } catch {
      /* ignore */
    }
    // Persist to DB (fire & forget — failure is non-critical)
    this.http
      .patch(`${environment.service_url}/auth/preferences/`, {
        measurement_system: value,
      })
      .pipe(catchError(() => of(null)))
      .subscribe();
  }
}
