import { Routes } from '@angular/router';
import { LoginComponent } from './modules/core/components/login/login.component';
import {
  adminGuard,
  authGuard,
  noAuthGuard,
} from './modules/core/guards/auth.guard';

/**
 * Routes are used only for URL state management (no <router-outlet>).
 * Navigation events update the address bar and trigger AppComponent's
 * router subscription; AppComponent controls what is rendered directly.
 * The /login route is the exception — it is rendered via <router-outlet>.
 */
export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [noAuthGuard] },
  { path: '', pathMatch: 'full', canActivate: [authGuard], children: [] },
  { path: 'assets', canActivate: [authGuard], children: [] },
  { path: 'vendors', canActivate: [authGuard], children: [] },
  { path: 'models', canActivate: [authGuard], children: [] },
  { path: 'racks', canActivate: [authGuard], children: [] },
  { path: 'components', canActivate: [authGuard], children: [] },
  { path: 'map/:id', canActivate: [authGuard], children: [] },
  { path: 'rack/:name', canActivate: [authGuard], children: [] },
  { path: 'admin', canActivate: [authGuard, adminGuard], children: [] },
  { path: 'change-password', canActivate: [authGuard], children: [] },
  { path: 'not-found', canActivate: [authGuard], children: [] },
  { path: '**', redirectTo: 'not-found' },
];
