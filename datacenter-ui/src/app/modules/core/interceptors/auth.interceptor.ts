import {
  HttpContextToken,
  HttpInterceptorFn,
  HttpStatusCode,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

/**
 * HTTP Interceptor for cookie-based JWT authentication.
 *
 * - Automatically includes HttpOnly cookies in all requests (via withCredentials=true)
 * - Handles 401 Unauthorized by attempting silent token refresh
 * - Handles 403 Forbidden by showing permission denied toast
 *
 * No manual Authorization header needed; cookies are sent automatically by browser.
 */
const RETRY_ALREADY_PERFORMED = new HttpContextToken<boolean>(() => false);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

function getCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const translate = inject(TranslateService);

  // Ensure credentials (cookies) are included in all requests and add CSRF header
  // for unsafe methods when csrftoken cookie is available.
  const csrfToken = !SAFE_METHODS.has(req.method)
    ? getCookie('csrftoken')
    : null;

  const reqWithCredentials = req.clone({
    withCredentials: true,
    setHeaders:
      csrfToken && !req.headers.has('X-CSRFToken')
        ? { 'X-CSRFToken': csrfToken }
        : {},
  });

  return next(reqWithCredentials).pipe(
    catchError((error) => {
      const isAuthEndpoint =
        req.url.includes('/auth/token/') ||
        req.url.includes('/auth/token/refresh/') ||
        req.url.includes('/auth/token/blacklist/') ||
        req.url.includes('/auth/logout/');

      if (error.status === HttpStatusCode.Forbidden) {
        toast.error(translate.instant('backend_errors.permission_denied'));
        return throwError(() => error);
      }
      if (error.status !== HttpStatusCode.Unauthorized) {
        return throwError(() => error);
      }
      if (isAuthEndpoint || req.context.get(RETRY_ALREADY_PERFORMED)) {
        return throwError(() => error);
      }
      // Access token expired (or invalid) — try a silent refresh then retry once.
      return auth.refresh().pipe(
        switchMap(() =>
          next(
            reqWithCredentials.clone({
              context: reqWithCredentials.context.set(
                RETRY_ALREADY_PERFORMED,
                true,
              ),
            }),
          ),
        ),
        catchError(() => throwError(() => error)),
      );
    }),
  );
};
