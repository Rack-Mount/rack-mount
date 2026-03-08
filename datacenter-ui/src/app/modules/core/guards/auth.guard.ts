import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RoleService } from '../services/role.service';

/** Protects routes that require authentication. Redirects to /login when not authenticated. */
export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated()
    ? true
    : router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url },
      });
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
