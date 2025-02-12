import { Component, Input, OnInit } from '@angular/core';
import {
  AssetService,
  Rack,
  Asset,
  RetrieveRackRequestParams,
} from '../../../core/api/v1';
import { NgFor } from '@angular/common';

@Component({
  selector: 'app-rack',
  imports: [NgFor],
  templateUrl: './rack.component.html',
  styleUrl: './rack.component.scss',
})
export class RackComponent implements OnInit {
  @Input() rackName: string | undefined;
  rack: Rack | undefined;
  rack_module: string[] = [];

  constructor(private readonly assetService: AssetService) {}

  ngOnInit() {
    const rack_params: RetrieveRackRequestParams = {
      name: this.rackName ?? '',
    };

    this.assetService.retrieveRack(rack_params).subscribe((rack) => {
      this.rack = rack;
      for (let i = 0; i < rack.model.capacity || 0; i++) {
        this.rack_module.push('' + (rack.model.capacity - i));
      }
    });
  }
}
