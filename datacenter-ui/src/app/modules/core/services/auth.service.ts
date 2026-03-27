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

/**
 * sessionStorage key for the session presence flag.
 * Stores a non-sensitive boolean ("1") to signal that a refresh-token cookie
 * exists on the browser, allowing the auth guard to attempt session restoration
 * on cold-start without making a network request when no session is present.
 * The actual refresh token is held in an HTTP-only Secure cookie set by the
 * backend and is never accessible from JavaScript.
 */
const SESSION_FLAG_KEY = 'has_session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly roleService = inject(RoleService);
  private readonly settingsService = inject(SettingsService);

  private readonly _username = signal<string>('');
  private readonly _accessToken = signal<string>('');

  /** True when the session-presence flag is set in sessionStorage. */
  private readonly _hasSession = signal<boolean>(
    sessionStorage.getItem(SESSION_FLAG_KEY) === '1',
  );

  readonly isAuthenticated = computed(() => !!this._username());
  readonly username = computed(() => this._username());
  /** Current access token — read by the auth interceptor. */
  readonly accessToken = computed(() => this._accessToken());
  /** True when a refresh-token cookie likely exists (based on session flag). */
  readonly hasRefreshToken = computed(() => this._hasSession());

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
          role: RoleData;
        }>(`${environment.service_url}/auth/token/`, credentials, {
          withCredentials: true,
        })
        .pipe(
          tap(({ username: returnedUsername, access, role }) => {
            this._username.set(returnedUsername);
            this._accessToken.set(access);
            this._setSessionFlag(true);
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

  private _setSessionFlag(active: boolean): void {
    this._hasSession.set(active);
    if (active) {
      sessionStorage.setItem(SESSION_FLAG_KEY, '1');
    } else {
      sessionStorage.removeItem(SESSION_FLAG_KEY);
    }
  }

  logout(): Observable<void> {
    this._username.set('');
    this._accessToken.set('');
    this._setSessionFlag(false);
    this._isRefreshing = false;
    this._refreshSubject.next(null);
    this._roleResponseCache$ = null;
    this.roleService.clear();

    return this.http
      .post<{ detail: string }>(
        `${environment.service_url}/auth/token/blacklist/`,
        {},
        { withCredentials: true },
      )
      .pipe(
        map(() => undefined),
        catchError((error) => throwError(() => error)),
      );
  }

  /** Fetches /auth/me/ and stores the returned username, role and preferences in memory.
   * Response is cached via shareReplay(1) so concurrent calls share the same request. */
  fetchAndLoadRole(): Observable<void> {
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
   * Obtains a new access token using the refresh-token HTTP-only cookie.
   * The cookie is sent automatically by the browser (withCredentials: true).
   * Concurrent callers wait on the same in-flight request.
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
        username: string;
      }>(`${environment.service_url}/auth/token/refresh/`, {}, {
        withCredentials: true,
      })
      .pipe(
        tap(({ access, username }) => {
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
