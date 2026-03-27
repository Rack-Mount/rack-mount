import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LocationService } from '../../api/v1/api/location.service';
import { Location as DjLocation } from '../../api/v1/model/location';
import { RoleService } from '../../services/role.service';
import { TabService } from '../../services/tab.service';
import { WarehouseAlertService } from '../../services/warehouse-alert.service';
import { HomeHeroComponent } from './home-hero/home-hero.component';
import {
  HomeLocationsComponent,
  RoomOpenEvent,
} from './home-locations/home-locations.component';
import { HomeStatsComponent } from './home-stats/home-stats.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HomeHeroComponent, HomeStatsComponent, HomeLocationsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private readonly tabService = inject(TabService);
  protected readonly role = inject(RoleService);
  private readonly locationService = inject(LocationService);
  protected readonly warehouseAlerts = inject(WarehouseAlertService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly locations = signal<DjLocation[]>([]);
  protected readonly loading = signal(true);
  protected readonly totalRooms = computed(() =>
    this.locations().reduce((sum, loc) => sum + (loc.rooms?.length ?? 0), 0),
  );

  constructor() {
    // Re-run when auth role is loaded after login so Home updates without refresh.
    effect(() => {
      if (!this.role.canViewInfrastructure()) {
        this.locations.set([]);
        this.loading.set(false);
        return;
      }

      this.loadLocations();
      this.warehouseAlerts.load();
    });
  }

  private loadLocations(): void {
    this.loading.set(true);
    this.locationService
      .locationLocationList({})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.locations.set(data.results ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }

  protected onRoomOpen(e: RoomOpenEvent): void {
    this.tabService.openRoom(e.id, e.name);
  }

  protected onAssetsOpen(): void {
    this.tabService.openAssets();
  }

  protected onModelsOpen(): void {
    this.tabService.openModels();
  }

  protected onRacksOpen(): void {
    this.tabService.openRacks();
  }

  protected onWarehouseOpen(): void {
    this.tabService.openWarehouse();
  }

  protected onRequestsOpen(): void {
    this.tabService.openRequests();
  }

  protected onAssetSettingsOpen(): void {
    this.tabService.openAssetSettings();
  }
}
