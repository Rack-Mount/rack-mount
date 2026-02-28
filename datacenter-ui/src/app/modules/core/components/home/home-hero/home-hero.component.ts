import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home-hero',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-hero.component.html',
  styleUrl: './home-hero.component.scss',
})
export class HomeHeroComponent {}
