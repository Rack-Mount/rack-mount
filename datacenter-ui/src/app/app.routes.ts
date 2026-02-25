import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'rack/:id',
    loadComponent: () =>
      import('./modules/data-center/components/rack/rack.component').then(
        (m) => m.RackComponent,
      ),
  },
  {
    path: 'map',
    loadComponent: () =>
      import('./modules/data-center/components/map/map.component').then(
        (m) => m.MapComponent,
      ),
  },
  {
    path: 'map/:id',
    loadComponent: () =>
      import('./modules/data-center/components/map/map.component').then(
        (m) => m.MapComponent,
      ),
  },
  {
    path: 'not-found',
    loadComponent: () =>
      import('./modules/core/components/not-found/not-found.component').then(
        (m) => m.NotFoundComponent,
      ),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./modules/core/components/not-found/not-found.component').then(
        (m) => m.NotFoundComponent,
      ),
  },
];
