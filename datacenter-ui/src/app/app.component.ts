import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DatacenterService } from './modules/core/api/v1';
import { RackComponent } from './modules/data-center/components/rack/rack.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RackComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'datacenter-ui';
  constructor(private readonly datacenterService: DatacenterService) {}

  ngOnInit() {
    this.datacenterService.listLocations().subscribe((data) => {
      console.log(data);
    });
  }
}
