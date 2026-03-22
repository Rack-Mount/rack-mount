import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { RoleService } from '../../services/role.service';
import { TabService } from '../../services/tab.service';
import { ThemeService } from '../../services/theme.service';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let authSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    authSpy = jasmine.createSpyObj<AuthService>('AuthService', ['logout']);
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        { provide: AuthService, useValue: authSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: LanguageService,
          useValue: {},
        },
        {
          provide: RoleService,
          useValue: {},
        },
        {
          provide: TabService,
          useValue: {
            openAdmin: () => {},
            openOptions: () => {},
          },
        },
        {
          provide: ThemeService,
          useValue: {},
        },
      ],
    })
      .overrideComponent(HeaderComponent, {
        set: { template: '' },
      })
      .compileComponents();
  });

  it('should call backend logout and navigate to login on success', () => {
    authSpy.logout.and.returnValue(of(undefined));
    const fixture = TestBed.createComponent(HeaderComponent);

    (fixture.componentInstance as any).logout();

    expect(authSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should navigate to login even when backend logout fails', () => {
    authSpy.logout.and.returnValue(
      throwError(() => new Error('logout failed')),
    );
    const fixture = TestBed.createComponent(HeaderComponent);

    (fixture.componentInstance as any).logout();

    expect(authSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });
});
