import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { RoleService } from '../services/role.service';

/** Protects routes that require authentication. Redirects to /login when not authenticated. */
export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const loginTree = router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });

  // If neither username nor refresh token is available, redirect immediately
  // without making any HTTP request.
  if (!auth.isAuthenticated() && !auth.hasRefreshToken()) {
    return loginTree;
  }

  // Either already authenticated or we have a refresh token (F5 scenario).
  // fetchAndLoadRole calls /auth/me/ — if the access token is missing/expired
  // the interceptor will transparently refresh it and retry. If refresh also
  // fails (401) the catchError below handles the redirect.
  return auth.fetchAndLoadRole().pipe(
    map(() => true),
    catchError(() => {
      auth.logout().subscribe({
        next: () => {},
        error: () => {},
      });
      return of(loginTree);
    }),
  );
};

/** Prevents authenticated users from accessing the login page. Redirects to / when already authenticated. */
export const noAuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return !auth.isAuthenticated() ? true : router.createUrlTree(['/']);
};

/** Restricts access to admin-role users only. Redirects to / for non-admins. */
export const adminGuard: CanActivateFn = () => {
  const role = inject(RoleService);
  const router = inject(Router);
  return role.isAdmin() ? true : router.createUrlTree(['/']);
};

/** Restricts access to users with can_view_assets. Redirects to / when denied. */
export const canViewAssetsGuard: CanActivateFn = () => {
  const role = inject(RoleService);
  const router = inject(Router);
  return role.canViewAssets() ? true : router.createUrlTree(['/']);
};

/** Restricts access to users with can_view_catalog. Redirects to / when denied. */
export const canViewCatalogGuard: CanActivateFn = () => {
  const role = inject(RoleService);
  const router = inject(Router);
  return role.canViewCatalog() ? true : router.createUrlTree(['/']);
};

/** Restricts access to users with can_view_infrastructure. Redirects to / when denied. */
export const canViewInfrastructureGuard: CanActivateFn = () => {
  const role = inject(RoleService);
  const router = inject(Router);
  return role.canViewInfrastructure() ? true : router.createUrlTree(['/']);
};

/** Restricts access to admins or users with can_view_infrastructure. Redirects to / when denied. */
export const adminOrInfraGuard: CanActivateFn = () => {
  const role = inject(RoleService);
  const router = inject(Router);
  return role.isAdmin() || role.canViewInfrastructure() || role.canViewCatalog()
    ? true
    : router.createUrlTree(['/']);
};
