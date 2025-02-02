import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DatacenterService } from './modules/core/api/v1';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'datacenter-ui';
  constructor(private readonly datacenterService: DatacenterService) {}

  ngOnInit() {
    this.datacenterService.listDataCenterLocations().subscribe((data) => {
      console.log(data);
    });
  }
}
