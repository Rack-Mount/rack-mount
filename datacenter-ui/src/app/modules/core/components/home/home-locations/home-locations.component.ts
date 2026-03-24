import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Location as DjLocation } from '../../../api/v1/model/location';

export interface RoomOpenEvent {
  id: number;
  name: string;
}

@Component({
  selector: 'app-home-locations',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-locations.component.html',
  styleUrl: './home-locations.component.scss',
})
export class HomeLocationsComponent {
  readonly loading = input.required<boolean>();
  readonly locations = input.required<DjLocation[]>();

  readonly canViewAssets = input<boolean>(false);
  readonly canViewCatalog = input<boolean>(false);
  readonly canViewInfrastructure = input<boolean>(false);
  readonly isAdmin = input<boolean>(false);

  readonly roomOpen = output<RoomOpenEvent>();
  readonly assetsOpen = output<void>();
  readonly modelsOpen = output<void>();
  readonly racksOpen = output<void>();
  readonly warehouseOpen = output<void>();
  readonly assetSettingsOpen = output<void>();

  protected onRoomClick(id: number, name: string): void {
    this.roomOpen.emit({ id, name });
  }

  protected onAssetsClick(): void {
    this.assetsOpen.emit();
  }

  protected onModelsClick(): void {
    this.modelsOpen.emit();
  }

  protected onRacksClick(): void {
    this.racksOpen.emit();
  }

  protected onWarehouseClick(): void {
    this.warehouseOpen.emit();
  }

  protected onAssetSettingsClick(): void {
    this.assetSettingsOpen.emit();
  }
}
