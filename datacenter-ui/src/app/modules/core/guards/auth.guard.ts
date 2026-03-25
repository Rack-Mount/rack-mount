import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { RoleService } from '../services/role.service';
import { TabService } from '../services/tab.service';

/** Protects routes that require authentication. Redirects to /login when not authenticated. */
export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const tabs = inject(TabService);

  const loginTree = router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });

  // Fast path: already authenticated — no HTTP call needed.
  if (auth.isAuthenticated()) {
    return true;
  }

  // No token at all — redirect immediately without any HTTP request.
  if (!auth.hasRefreshToken()) {
    return loginTree;
  }

  // F5 / cold-start: refresh token exists but access token is gone.
  // Explicitly refresh first, then fetch /auth/me/ with the new access token.
  // This avoids relying on the interceptor's 401-retry dance for session restore.
  return auth.refresh().pipe(
    switchMap(() => auth.fetchAndLoadRole()),
    map(() => {
      tabs.purgeForbiddenTabs();
      return true;
    }),
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

/** Restricts access to users with can_view_warehouse. Redirects to / when denied. */
export const canViewWarehouseGuard: CanActivateFn = () => {
  const role = inject(RoleService);
  const router = inject(Router);
  return role.canViewWarehouse() ? true : router.createUrlTree(['/']);
};

/** Restricts access to admins or users with can_view_infrastructure. Redirects to / when denied. */
export const adminOrInfraGuard: CanActivateFn = () => {
  const role = inject(RoleService);
  const router = inject(Router);
  return role.isAdmin() || role.canViewInfrastructure() || role.canViewCatalog()
    ? true
    : router.createUrlTree(['/']);
};
