import {
  HttpContextToken,
  HttpInterceptorFn,
  HttpStatusCode,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

/**
 * HTTP Interceptor for Bearer-token JWT authentication.
 *
 * - Adds Authorization: Bearer <access_token> to all API requests.
 * - Handles 401 Unauthorized by attempting a silent token refresh, then retrying once.
 * - Handles 403 Forbidden by showing a permission-denied toast.
 */
const RETRY_ALREADY_PERFORMED = new HttpContextToken<boolean>(() => false);

function isApiRequest(url: string): boolean {
  try {
    const target = new URL(url, window.location.origin);
    const apiBase = new URL(environment.service_url, window.location.origin);
    return (
      target.origin === apiBase.origin &&
      target.pathname.startsWith(apiBase.pathname)
    );
  } catch {
    return false;
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const translate = inject(TranslateService);

  const token = auth.accessToken();
  // Do not attach an expired access token to public auth endpoints (AllowAny).
  // JWTAuthentication raises AuthenticationFailed for expired tokens before
  // AllowAny can bypass the check, causing a spurious 401 on /auth/token/refresh/.
  const isPublicAuthUrl =
    req.url.includes('/auth/token/refresh/') ||
    new URL(req.url, window.location.origin).pathname.endsWith('/auth/token/');
  const outgoing =
    token && isApiRequest(req.url) && !isPublicAuthUrl
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(outgoing).pipe(
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

      // Access token expired — refresh and retry once with the new token.
      return auth.refresh().pipe(
        switchMap(() => {
          const newToken = auth.accessToken();
          const retryReq = outgoing.clone({
            setHeaders: { Authorization: `Bearer ${newToken}` },
            context: outgoing.context.set(RETRY_ALREADY_PERFORMED, true),
          });
          return next(retryReq);
        }),
        catchError(() => throwError(() => error)),
      );
    }),
  );
};
