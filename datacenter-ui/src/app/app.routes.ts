import { Routes } from '@angular/router';
import { RackComponent } from './modules/data-center/components/rack/rack.component';
import { MapComponent } from './modules/data-center/components/map/map.component';

export const routes: Routes = [
  { path: 'rack/:id', component: RackComponent },
  { path: 'map', component: MapComponent },
];
