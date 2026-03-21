import { HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Redirects to /not-found ONLY for navigation-level 404s (i.e. requests to
 * static assets or server-rendered pages), NOT for API calls.
 *
 * All Angular HttpClient requests are XHR calls to the REST API.
 * API-level 404s (e.g. GET /api/asset/999) must be handled by the calling
 * component or store — a global full-page redirect would destroy the active
 * tab in a tab-based SPA.
 *
 * The Angular Router's wildcard route (`**`) already handles unknown client-
 * side routes without any interceptor involvement.
 *
 * We restrict the redirect to requests whose URL does NOT start with the
 * configured API base URL, which covers edge cases like a misconfigured static-
 * file URL being fetched via HttpClient (e.g. translation JSON files).
 */
export const notFoundInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  return next(req).pipe(
    catchError((error) => {
      const isApiCall = req.url.startsWith(environment.service_url);
      if (error.status === HttpStatusCode.NotFound && !isApiCall) {
        router.navigate(['/not-found']);
      }
      return throwError(() => error);
    }),
  );
};
