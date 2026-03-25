import { Routes } from '@angular/router';
import {
  adminGuard,
  adminOrInfraGuard,
  authGuard,
  canViewAssetsGuard,
  canViewCatalogGuard,
  canViewInfrastructureGuard,
  canViewWarehouseGuard,
  noAuthGuard,
} from './modules/core/guards/auth.guard';

/**
 * Static routes use loadComponent → Angular Router lazy-loads the JS chunk
 * on first navigation.  Dynamic segments (map/:id, rack/:name) keep
 * children:[] because their panes are managed by AppComponent directly.
 * The /login route is the only one rendered via <router-outlet>.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [noAuthGuard],
    loadComponent: () =>
      import('./modules/core/components/login/login.component').then(
        (m) => m.LoginComponent,
      ),
  },
  { path: '', pathMatch: 'full', canActivate: [authGuard], children: [] },
  {
    path: 'assets',
    canActivate: [authGuard, canViewAssetsGuard],
    loadComponent: () =>
      import('./modules/data-center/components/assets/assets-list/assets-list.component').then(
        (m) => m.AssetsListComponent,
      ),
  },
  {
    path: 'models',
    canActivate: [authGuard, canViewCatalogGuard],
    loadComponent: () =>
      import('./modules/data-center/components/catalog/models-list/models-list.component').then(
        (m) => m.ModelsListComponent,
      ),
  },

  {
    path: 'racks',
    canActivate: [authGuard, canViewInfrastructureGuard],
    loadComponent: () =>
      import('./modules/data-center/components/infrastructure/racks-list/racks-list.component').then(
        (m) => m.RacksListComponent,
      ),
  },
  {
    path: 'warehouse',
    canActivate: [authGuard, canViewWarehouseGuard],
    loadComponent: () =>
      import('./modules/data-center/components/warehouse-inventory/warehouse-inventory.component').then(
        (m) => m.WarehouseInventoryComponent,
      ),
  },
  {
    path: 'asset-settings',
    canActivate: [authGuard, adminOrInfraGuard],
    loadComponent: () =>
      import('./modules/data-center/components/catalog/asset-settings/asset-settings.component').then(
        (m) => m.AssetSettingsComponent,
      ),
  },
  {
    path: 'map/:id',
    canActivate: [authGuard, canViewInfrastructureGuard],
    children: [],
  },
  {
    path: 'rack/:name',
    canActivate: [authGuard, canViewInfrastructureGuard],
    children: [],
  },
  {
    path: 'asset/:id',
    canActivate: [authGuard, canViewAssetsGuard],
    children: [],
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./modules/admin/components/users-list/users-list.component').then(
        (m) => m.UsersListComponent,
      ),
  },
  {
    path: 'options',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./modules/core/components/options/options.component').then(
        (m) => m.OptionsComponent,
      ),
  },
  {
    path: 'not-found',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./modules/core/components/not-found/not-found.component').then(
        (m) => m.NotFoundComponent,
      ),
  },
  { path: '**', redirectTo: 'not-found' },
];
