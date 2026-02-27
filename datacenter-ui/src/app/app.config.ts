import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { Configuration, ConfigurationParameters } from './modules/core/api/v1';
import { environment } from '../environments/environment';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { notFoundInterceptor } from './modules/core/interceptors/not-found.interceptor';

export function apiConfigFactory(): Configuration {
  const params: ConfigurationParameters = {
    basePath: environment.service_url,
    username: environment.api_username,
    password: environment.api_password,
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
    provideHttpClient(withFetch(), withInterceptors([notFoundInterceptor])),
  ],
};
