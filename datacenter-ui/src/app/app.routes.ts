import { Routes } from '@angular/router';

/**
 * Routes are used only for URL state management (no <router-outlet>).
 * Navigation events update the address bar and trigger AppComponent's
 * router subscription; AppComponent controls what is rendered directly.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', children: [] },
  { path: 'assets', children: [] },
  { path: 'vendors', children: [] },
  { path: 'models', children: [] },
  { path: 'racks', children: [] },
  { path: 'map/:id', children: [] },
  { path: 'rack/:name', children: [] },
  { path: 'not-found', children: [] },
  { path: '**', redirectTo: 'not-found' },
];
