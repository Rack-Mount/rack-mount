import { inject, Injectable, signal } from '@angular/core';
import { LocationService } from '../api/v1';
import { RoleService } from './role.service';

@Injectable({ providedIn: 'root' })
export class WarehouseAlertService {
  private readonly locationService = inject(LocationService);
  private readonly role = inject(RoleService);

  readonly count = signal<number>(0);

  load(): void {
    if (!this.role.canViewInfrastructure()) return;
    this.locationService
      .locationWarehouseItemList({ belowThreshold: true, pageSize: 1 })
      .subscribe({
        next: (res) => this.count.set(res.count ?? 0),
        error: () => {},
      });
  }
}
