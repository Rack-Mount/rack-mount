import { HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** URL fragments that must never receive an Authorization header. */
const AUTH_BYPASS = ['/auth/token/'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const isBypass = AUTH_BYPASS.some((fragment) => req.url.includes(fragment));
  if (isBypass || !auth.isAuthenticated()) {
    return next(req);
  }

  const withBearer = (token: string) =>
    req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  return next(withBearer(auth.accessToken())).pipe(
    catchError((error) => {
      if (error.status !== HttpStatusCode.Unauthorized) {
        return throwError(() => error);
      }
      // Access token expired — try a silent refresh then retry once.
      return auth.refresh().pipe(
        switchMap((newToken) => next(withBearer(newToken))),
        catchError(() => throwError(() => error)),
      );
    }),
  );
};
