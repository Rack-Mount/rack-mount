import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AssetRackUnitListRequestParams,
  AssetService,
  Rack,
  RackUnit,
} from '../../../core/api/v1';
import { RackRender } from '../../models/RackRender';
import { DeviceComponent } from '../device/device.component';

@Component({
  selector: 'app-rack',
  imports: [DeviceComponent],
  templateUrl: './rack.component.html',
  styleUrl: './rack.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackComponent implements OnChanges {
  @Input() rack: Rack | undefined;
  assets: RackUnit[] = [];
  rackRender: RackRender[] = [];

  private readonly assetService = inject(AssetService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rack'] && this.rack) {
      this.renderRack();
    }
  }

  private renderRack(): void {
    if (!this.rack) return;
    this.rackRender = [];

    for (let i = 0; i < this.rack.model.capacity; i++) {
      this.rackRender.push({
        rack_unit: 1,
        position: this.rack.model.capacity - i,
        visible: true,
      });
    }

    const params: AssetRackUnitListRequestParams = {
      rackName: this.rack.name,
      pageSize: this.rack.model.capacity,
    };

    this.assetService
      .assetRackUnitList(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((assets) => {
        this.assets = assets.results;
        const capacity = this.rack!.model.capacity;
        this.assets.forEach((asset) => {
          const topIndex = capacity - asset.position - 1;
          const existingPosition = this.rackRender[topIndex].position;
          this.rackRender[topIndex] = {
            device: asset,
            rack_unit: asset.device_rack_units,
            position: existingPosition,
            visible: true,
          };
          for (let i = 1; i < asset.device_rack_units; i++) {
            this.rackRender[topIndex - i].visible = false;
          }
        });
        this.cdr.markForCheck();
      });
  }
}
