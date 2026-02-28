import { inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export interface Language {
  code: string;
  label: string;
  flag: string;
}

const STORAGE_KEY = 'app_language';

export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);

  readonly availableLanguages = AVAILABLE_LANGUAGES;

  /**
   * Currently active language code (signal, updated on every switch).
   * Initialised from localStorage or falls back to 'it'.
   */
  readonly currentLang = signal<string>(this._loadSaved());

  constructor() {
    const lang = this.currentLang();
    this.translate.addLangs(AVAILABLE_LANGUAGES.map((l) => l.code));
    this.translate.setFallbackLang('it');
    this.translate.use(lang);
  }

  /** Switch to the given language code and persist the choice. */
  use(code: string): void {
    if (!AVAILABLE_LANGUAGES.some((l) => l.code === code)) return;
    this.translate.use(code);
    this.currentLang.set(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // localStorage not available (SSR / private mode) – ignore
    }
  }

  /** Returns the Language object for the current language. */
  get currentLanguage(): Language {
    return (
      AVAILABLE_LANGUAGES.find((l) => l.code === this.currentLang()) ??
      AVAILABLE_LANGUAGES[0]
    );
  }

  private _loadSaved(): string {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && AVAILABLE_LANGUAGES.some((l) => l.code === saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'it';
  }
}
