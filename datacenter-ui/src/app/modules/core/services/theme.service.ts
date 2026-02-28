import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

const LS_THEME_KEY = 'dc:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this._resolve());

  readonly theme = this._theme.asReadonly();
  readonly isDark = () => this._theme() === 'dark';

  /** Call once at app bootstrap to hydrate the <html> attribute. */
  init(): void {
    this._apply(this._theme());
  }

  toggle(): void {
    this.set(this._theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this._theme.set(theme);
    this._apply(theme);
    try {
      localStorage.setItem(LS_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }

  private _apply(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
  }

  private _resolve(): Theme {
    try {
      const stored = localStorage.getItem(LS_THEME_KEY) as Theme | null;
      if (stored === 'dark' || stored === 'light') return stored;
    } catch {
      /* ignore */
    }
    // Respect OS preference as default
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
}
