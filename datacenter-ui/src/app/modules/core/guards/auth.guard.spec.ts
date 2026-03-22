import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const loginTree = { redirectedToLogin: true } as unknown as UrlTree;

  let authMock: {
    isAuthenticated: jasmine.Spy;
    fetchAndLoadRole: jasmine.Spy;
    logout: jasmine.Spy;
  };

  beforeEach(() => {
    authMock = {
      isAuthenticated: jasmine.createSpy('isAuthenticated'),
      fetchAndLoadRole: jasmine.createSpy('fetchAndLoadRole'),
      logout: jasmine.createSpy('logout').and.returnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        {
          provide: Router,
          useValue: {
            createUrlTree: jasmine
              .createSpy('createUrlTree')
              .and.returnValue(loginTree),
          },
        },
      ],
    });
  });

  function runGuard() {
    return TestBed.runInInjectionContext(() =>
      authGuard(
        {} as ActivatedRouteSnapshot,
        { url: '/admin' } as RouterStateSnapshot,
      ),
    );
  }

  it('should redirect to login when not authenticated locally', () => {
    authMock.isAuthenticated.and.returnValue(false);

    const result = runGuard();

    expect(result).toBe(loginTree);
    expect(authMock.fetchAndLoadRole).not.toHaveBeenCalled();
  });

  it('should allow when server-side role fetch succeeds', async () => {
    authMock.isAuthenticated.and.returnValue(true);
    authMock.fetchAndLoadRole.and.returnValue(of(undefined));

    const result = runGuard();
    const resolved = await firstValueFrom(
      result as Observable<boolean | UrlTree>,
    );

    expect(resolved).toBeTrue();
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('should logout and redirect when server-side validation fails', async () => {
    authMock.isAuthenticated.and.returnValue(true);
    authMock.fetchAndLoadRole.and.returnValue(
      throwError(() => new Error('unauthorized')),
    );

    const result = runGuard();
    const resolved = await firstValueFrom(
      result as Observable<boolean | UrlTree>,
    );

    expect(authMock.logout).toHaveBeenCalled();
    expect(resolved).toBe(loginTree);
  });
});
