import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { RackComponent } from './rack.component';

describe('RackComponent', () => {
  let component: RackComponent;
  let fixture: ComponentFixture<RackComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RackComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(RackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with translation providers', () => {
    expect(component).toBeTruthy();
  });
});
