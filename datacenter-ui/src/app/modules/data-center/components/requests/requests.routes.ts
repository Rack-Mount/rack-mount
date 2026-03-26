import { Routes } from '@angular/router';

export const REQUESTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./requests-list/requests-list.component').then(
        (m) => m.RequestsListComponent,
      ),
  },
];
