import { inject, Injectable } from '@angular/core';
import { BASE_PATH, Configuration } from '../api/v1';

/**
 * Abstract base for services that need to resolve the API base URL from the
 * shared `Configuration` token (or `BASE_PATH` injection token).  Extend this
 * class and use `this.basePath` when building request URLs.
 */
@Injectable()
export abstract class BaseApiService {
  protected readonly basePath: string = (() => {
    const configuration = inject(Configuration, { optional: true });
    const base = inject(BASE_PATH, { optional: true }) as
      | string
      | string[]
      | null;
    return (
      configuration?.basePath ??
      (Array.isArray(base) ? base[0] : base) ??
      'http://localhost'
    );
  })();
}
