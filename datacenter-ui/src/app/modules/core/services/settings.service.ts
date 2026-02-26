import { Injectable, signal } from '@angular/core';

const LS_AUTOSAVE_KEY = 'dc:autosave';

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
}
