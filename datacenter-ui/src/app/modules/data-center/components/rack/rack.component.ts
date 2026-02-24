import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
})
export class RackComponent implements OnChanges, OnInit {
  @Input() rack: Rack | undefined;
  assets: RackUnit[] = [];
  rackRender: RackRender[] = [];

  constructor(
    private readonly assetService: AssetService,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.assetService.assetRackRetrieve({ name: id }).subscribe((rack) => {
          this.rack = rack;
          this.renderRack();
        });
      }
    });

    if (this.rack) {
      this.renderRack();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rack'] && this.rack) {
      this.renderRack();
    }
  }

  private renderRack(): void {
    if (!this.rack) return;
    this.rackRender = []; // Clear previous render

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

    this.assetService.assetRackUnitList(params).subscribe((assets) => {
      this.assets = assets.results;
      this.assets.forEach((asset) => {
        console.log(asset.position);
        this.rackRender[this.rack!.model.capacity - asset.position - 1] = {
          device: asset,
          rack_unit: asset.device_rack_units,
          visible: true,
        };
        if (asset.device_rack_units > 1) {
          for (let i = 1; i < asset.device_rack_units; i++) {
            this.rackRender[
              this.rack!.model.capacity - asset.position - i + 1
            ].visible = false;
          }
        }
      });
    });
    console.log(this.rackRender);
  }
}
