import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  AssetRackRetrieveRequestParams,
  AssetService,
  DatacenterService,
  Rack,
} from './modules/core/api/v1';
import { RackComponent } from './modules/data-center/components/rack/rack.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RackComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'datacenter-ui';
  rack: Rack | undefined;

  constructor(
    private readonly datacenterService: DatacenterService,
    private readonly assetService: AssetService
  ) {}

  ngOnInit() {
    this.datacenterService.datacenterLocationList().subscribe((data) => {
      console.log(data);
    });

    const rack_params: AssetRackRetrieveRequestParams = {
      name: '19',
    };

    this.assetService.assetRackRetrieve(rack_params).subscribe((rack) => {
      this.rack = rack;
    });
  }
}
