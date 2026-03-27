import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  filter,
  map,
  Observable,
  shareReplay,
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

/** sessionStorage key for the refresh token (survives F5, cleared on tab close). */
const REFRESH_TOKEN_KEY = 'rt';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly roleService = inject(RoleService);
  private readonly settingsService = inject(SettingsService);

  private readonly _username = signal<string>('');
  private readonly _accessToken = signal<string>('');
  /** Refresh token — restored from sessionStorage on page load. */
  private readonly _refreshToken = signal<string>(
    sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? '',
  );

  readonly isAuthenticated = computed(() => !!this._username());
  readonly username = computed(() => this._username());
  /** Current access token — read by the auth interceptor. */
  readonly accessToken = computed(() => this._accessToken());
  /** True when a refresh token is stored — used by the guard to decide whether to attempt session restoration. */
  readonly hasRefreshToken = computed(() => !!this._refreshToken());

  // ── Token refresh ─────────────────────────────────────────────────────────
  private _isRefreshing = false;
  private readonly _refreshSubject = new BehaviorSubject<void | null>(null);
  /** Cached response from /auth/me/ — shared across concurrent calls via shareReplay(1). */
  private _roleResponseCache$: Observable<{
    username: string;
    role: RoleData;
    measurement_system?: string;
  }> | null = null;

  login(username: string, credentials?: LoginCredentials): Observable<void> {
    // If credentials provided, validate credentials first
    if (credentials) {
      return this.http
        .post<{
          detail: string;
          username: string;
          access: string;
          refresh: string;
          role: RoleData;
        }>(`${environment.service_url}/auth/token/`, credentials)
        .pipe(
          tap(({ username: returnedUsername, access, refresh, role }) => {
            this._username.set(returnedUsername);
            this._accessToken.set(access);
            this._setRefreshToken(refresh);
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

  private _setRefreshToken(token: string): void {
    this._refreshToken.set(token);
    if (token) {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  logout(): Observable<void> {
    const refresh = this._refreshToken();
    this._username.set('');
    this._accessToken.set('');
    this._setRefreshToken('');
    this._isRefreshing = false;
    this._refreshSubject.next(null);
    this._roleResponseCache$ = null; // Invalidate cache on logout
    this.roleService.clear();

    return this.http
      .post<{
        detail: string;
      }>(`${environment.service_url}/auth/token/blacklist/`, { refresh })
      .pipe(
        map(() => undefined),
        catchError((error) => {
          // Even if blacklist fails, considered logged out on client side
          return throwError(() => error);
        }),
      );
  }

  /** Fetches /auth/me/ and stores the returned username, role and preferences in memory.
   * Response is cached via shareReplay(1) so concurrent calls share the same request. */
  fetchAndLoadRole(): Observable<void> {
    // Return cached response if available; otherwise, create new request and cache it
    if (!this._roleResponseCache$) {
      this._roleResponseCache$ = this.http
        .get<{
          username: string;
          role: RoleData;
          measurement_system?: string;
        }>(`${environment.service_url}/auth/me/`)
        .pipe(shareReplay(1));
    }

    return this._roleResponseCache$.pipe(
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
      .post<{
        detail: string;
        access: string;
        refresh: string | null;
        username: string;
      }>(`${environment.service_url}/auth/token/refresh/`, {
        refresh: this._refreshToken(),
      })
      .pipe(
        tap(({ access, refresh, username }) => {
          // Set state BEFORE notifying waiters: _refreshSubject.next() is
          // synchronous and immediately runs any queued interceptor's switchMap.
          // If accessToken were still '' at that point, the retry would send
          // an empty Bearer header and get another 401.
          //
          // NOTE: We intentionally do NOT load the role from the JWT claims
          // returned here. Those claims are a stale snapshot from login time
          // and may be missing fields added by later DB migrations (e.g.
          // can_view_requests). Loading stale role data here fires
          // _roleLoaded$.next() prematurely, which causes permission guards
          // (canViewRequestsGuard, etc.) to evaluate against incomplete data
          // and redirect to "/" on browser refresh. The authoritative role is
          // always fetched from /auth/me/ via fetchAndLoadRole().
          this._accessToken.set(access);
          if (refresh) this._setRefreshToken(refresh);
          if (username) this._username.set(username);
          this._isRefreshing = false;
          this._refreshSubject.next(undefined);
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
