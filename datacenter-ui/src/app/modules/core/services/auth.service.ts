import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  filter,
  map,
  Observable,
  take,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RoleData, RoleService } from './role.service';
import { MeasurementSystemSetting, SettingsService } from './settings.service';

interface LoginCredentials {
  username: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly roleService = inject(RoleService);
  private readonly settingsService = inject(SettingsService);

  private readonly _username = signal<string>('');
  private readonly _accessToken = signal<string>('');
  private readonly _refreshToken = signal<string>('');

  readonly isAuthenticated = computed(() => !!this._username());
  readonly username = computed(() => this._username());
  /** Current access token — read by the auth interceptor. */
  readonly accessToken = computed(() => this._accessToken());

  // ── Token refresh ─────────────────────────────────────────────────────────
  private _isRefreshing = false;
  private readonly _refreshSubject = new BehaviorSubject<void | null>(null);

  login(username: string, credentials?: LoginCredentials): Observable<void> {
    // If credentials provided, validate credentials first
    if (credentials) {
      return this.http
        .post<{ detail: string; username: string; access: string; refresh: string; role: RoleData }>(
          `${environment.service_url}/auth/token/`,
          credentials,
        )
        .pipe(
          tap(({ username: returnedUsername, access, refresh, role }) => {
            this._username.set(returnedUsername);
            this._accessToken.set(access);
            this._refreshToken.set(refresh);
            if (role) this.roleService.load(role);
          }),
          map(() => undefined),
          catchError((error) => throwError(() => error)),
        );
    }

    // If no credentials, just set username (already authenticated via cookies)
    this._username.set(username);
    return new Observable((observer) => {
      observer.next();
      observer.complete();
    });
  }

  logout(): Observable<void> {
    const refresh = this._refreshToken();
    this._username.set('');
    this._accessToken.set('');
    this._refreshToken.set('');
    this._isRefreshing = false;
    this._refreshSubject.next(null);
    this.roleService.clear();

    return this.http
      .post<{ detail: string }>(
        `${environment.service_url}/auth/token/blacklist/`,
        { refresh },
      )
      .pipe(
        map(() => undefined),
        catchError((error) => {
          // Even if blacklist fails, considered logged out on client side
          return throwError(() => error);
        }),
      );
  }

  /** Fetches /auth/me/ and stores the returned username, role and preferences in memory. */
  fetchAndLoadRole(): Observable<void> {
    return this.http
      .get<{
        username: string;
        role: RoleData;
        measurement_system?: string;
      }>(`${environment.service_url}/auth/me/`)
      .pipe(
        map(({ username, role, measurement_system }) => {
          if (username) this._username.set(username);
          if (role) this.roleService.load(role);
          if (measurement_system) {
            this.settingsService.loadFromServer(
              measurement_system as MeasurementSystemSetting,
            );
          }
        }),
      );
  }

  /**
   * Tries to obtain a new access token using the refresh token stored in HttpOnly cookies.
   * Concurrent callers wait on the same in-flight request.
   * Cookies are automatically included in the request via withCredentials=true.
   */
  refresh(): Observable<void> {
    if (this._isRefreshing) {
      return this._refreshSubject.pipe(
        filter((t): t is void => t !== null),
        take(1),
      );
    }

    this._isRefreshing = true;
    this._refreshSubject.next(null);

    return this.http
      .post<{ detail: string; access: string; username: string; role: RoleData }>(
        `${environment.service_url}/auth/token/refresh/`,
        { refresh: this._refreshToken() },
      )
      .pipe(
        tap(({ access, username, role }) => {
          this._isRefreshing = false;
          this._refreshSubject.next(undefined);
          this._accessToken.set(access);
          if (username) this._username.set(username);
          if (role) this.roleService.load(role);
        }),
        map(() => undefined),
        catchError((err) => {
          this._isRefreshing = false;
          this.logout().subscribe({
            next: () => {},
            error: () => {},
          });
          return throwError(() => err);
        }),
      );
  }
}
