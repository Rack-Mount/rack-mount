import { Component, Input, OnInit } from '@angular/core';
import { AssetService, RetrieveRackRequestParams } from '../../../core/api/v1';

@Component({
  selector: 'app-rack',
  imports: [],
  templateUrl: './rack.component.html',
  styleUrl: './rack.component.scss',
})
export class RackComponent implements OnInit {
  @Input() rack: string | undefined;

  constructor(private readonly assetService: AssetService) {}

  ngOnInit() {
    const rack: RetrieveRackRequestParams = {
      name: this.rack ?? '',
    };
    this.assetService.retrieveRack(rack).subscribe((assets) => {
      console.log(assets);
    });
  }
}
