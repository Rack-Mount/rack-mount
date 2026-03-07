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

interface TokenPair {
  access: string;
  refresh: string;
}

const STORAGE_KEYS = {
  access: 'auth_access',
  refresh: 'auth_refresh',
  username: 'auth_username',
} as const;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _accessToken = signal<string>(
    localStorage.getItem(STORAGE_KEYS.access) ?? '',
  );
  private readonly _refreshToken = signal<string>(
    localStorage.getItem(STORAGE_KEYS.refresh) ?? '',
  );
  private readonly _username = signal<string>(
    localStorage.getItem(STORAGE_KEYS.username) ?? '',
  );

  readonly isAuthenticated = computed(() => !!this._accessToken());
  readonly username = computed(() => this._username());

  /** Returns the raw access token string. */
  accessToken(): string {
    return this._accessToken();
  }

  login(username: string, tokens: TokenPair): void {
    this._username.set(username);
    this._accessToken.set(tokens.access);
    this._refreshToken.set(tokens.refresh);
    localStorage.setItem(STORAGE_KEYS.username, username);
    localStorage.setItem(STORAGE_KEYS.access, tokens.access);
    localStorage.setItem(STORAGE_KEYS.refresh, tokens.refresh);
  }

  logout(): void {
    this._username.set('');
    this._accessToken.set('');
    this._refreshToken.set('');
    localStorage.removeItem(STORAGE_KEYS.username);
    localStorage.removeItem(STORAGE_KEYS.access);
    localStorage.removeItem(STORAGE_KEYS.refresh);
    this._isRefreshing = false;
    this._refreshSubject.next(null);
  }

  // ── Token refresh ─────────────────────────────────────────────────────────

  private _isRefreshing = false;
  private readonly _refreshSubject = new BehaviorSubject<string | null>(null);

  /**
   * Tries to obtain a new access token using the stored refresh token.
   * Concurrent callers wait on the same in-flight request.
   */
  refresh(): Observable<string> {
    if (this._isRefreshing) {
      return this._refreshSubject.pipe(
        filter((t): t is string => t !== null),
        take(1),
      );
    }

    this._isRefreshing = true;
    this._refreshSubject.next(null);

    return this.http
      .post<{
        access: string;
      }>(`${environment.service_url}/auth/token/refresh/`, {
        refresh: this._refreshToken(),
      })
      .pipe(
        tap(({ access }) => {
          this._accessToken.set(access);
          localStorage.setItem(STORAGE_KEYS.access, access);
          this._isRefreshing = false;
          this._refreshSubject.next(access);
        }),
        map(({ access }) => access),
        catchError((err) => {
          this._isRefreshing = false;
          this.logout();
          return throwError(() => err);
        }),
      );
  }
}
