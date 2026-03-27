import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { firstValueFrom, isObservable, of, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const loginTree = { redirectedToLogin: true } as unknown as UrlTree;

  let authMock: {
    isAuthenticated: jasmine.Spy;
    hasRefreshToken: jasmine.Spy;
    refresh: jasmine.Spy;
    fetchAndLoadRole: jasmine.Spy;
    logout: jasmine.Spy;
  };

  beforeEach(() => {
    authMock = {
      isAuthenticated: jasmine.createSpy('isAuthenticated'),
      hasRefreshToken: jasmine.createSpy('hasRefreshToken'),
      refresh: jasmine.createSpy('refresh').and.returnValue(of(undefined)),
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

  async function resolveGuardResult(): Promise<unknown> {
    const result = runGuard();
    return isObservable(result) ? firstValueFrom(result) : result;
  }

  it('should redirect to login when not authenticated locally', () => {
    authMock.isAuthenticated.and.returnValue(false);
    authMock.hasRefreshToken.and.returnValue(false);

    const result = runGuard();

    expect(result).toBe(loginTree);
    expect(authMock.fetchAndLoadRole).not.toHaveBeenCalled();
  });

  it('should allow when server-side role fetch succeeds', async () => {
    authMock.isAuthenticated.and.returnValue(true);
    authMock.fetchAndLoadRole.and.returnValue(of(undefined));

    const resolved = await resolveGuardResult();

    expect(resolved).toBeTrue();
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('should redirect to login when server-side role fetch fails', async () => {
    authMock.isAuthenticated.and.returnValue(true);
    authMock.fetchAndLoadRole.and.returnValue(
      throwError(() => new Error('unauthorized')),
    );

    const resolved = await resolveGuardResult();

    expect(authMock.logout).not.toHaveBeenCalled();
    expect(resolved).toBe(loginTree);
  });
});
