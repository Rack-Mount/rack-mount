import {
  ApplicationConfig,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import {
  ApiModule,
  Configuration,
  ConfigurationParameters,
} from './modules/core/api/v1';
import { environment } from '../environments/environment';
import { provideHttpClient, withFetch } from '@angular/common/http';

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
      })
    ),
    importProvidersFrom(ApiModule.forRoot(apiConfigFactory)),
    provideHttpClient(withFetch()),
  ],
};
