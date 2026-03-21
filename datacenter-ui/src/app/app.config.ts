import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { Configuration, ConfigurationParameters } from './modules/core/api/v1';
import { authInterceptor } from './modules/core/interceptors/auth.interceptor';
import { notFoundInterceptor } from './modules/core/interceptors/not-found.interceptor';

const AVAILABLE_LANG_CODES = ['de', 'en', 'fr', 'it', 'zh'];

function initTranslations() {
  const translate = inject(TranslateService);
  let lang = 'en';
  try {
    const saved = localStorage.getItem('app_language');
    if (saved && AVAILABLE_LANG_CODES.includes(saved)) lang = saved;
  } catch {
    // ignore (SSR / private mode)
  }
  translate.addLangs(AVAILABLE_LANG_CODES);
  translate.setFallbackLang('en');
  return translate.use(lang);
}

export function apiConfigFactory(): Configuration {
  const params: ConfigurationParameters = {
    basePath: environment.service_url,
  };
  return new Configuration(params);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: 'disabled',
        scrollPositionRestoration: 'top',
      }),
    ),
    { provide: Configuration, useFactory: apiConfigFactory },
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor, notFoundInterceptor]),
    ),
    provideTranslateService({
      fallbackLang: 'en',
    }),
    provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' }),
    provideAppInitializer(initTranslations),
  ],
};
