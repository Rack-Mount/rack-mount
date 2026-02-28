import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * Parses Django REST Framework HttpErrorResponse objects and returns a
 * user-facing error message in the currently active UI language.
 *
 * DRF response shapes handled:
 *  - Field errors:  { field: ["msg"] | [{ message, code }] }
 *  - Non-field:     { non_field_errors: [...] }
 *  - Detail:        { detail: "msg" }
 *  - HTTP status fallbacks (401, 403, 409, 429, 5xx)
 */
@Injectable({ providedIn: 'root' })
export class BackendErrorService {
  private readonly translate = inject(TranslateService);

  parse(err: HttpErrorResponse): string {
    // HTTP-status codes that don't carry a meaningful body
    if (err.status === 0) return this.t('backend_errors.network');
    if (err.status === 401) return this.t('backend_errors.authentication');
    if (err.status === 403) return this.t('backend_errors.permission_denied');
    if (err.status === 409) return this.t('backend_errors.conflict');
    if (err.status === 429) return this.t('backend_errors.throttled');
    if (err.status >= 500) return this.t('backend_errors.server');

    const body = err.error;
    if (!body || typeof body !== 'object') {
      return this.t('backend_errors.fallback');
    }

    // `detail` key (DRF auth/permission, custom raise ValidationError)
    if (typeof body['detail'] === 'string') {
      return this._resolveMsg(body['detail'], undefined);
    }

    // Field-level errors – take the first message found
    for (const errors of Object.values(body)) {
      const list = Array.isArray(errors) ? errors : [errors];
      for (const e of list) {
        if (typeof e === 'string') {
          return this._resolveMsg(e, undefined);
        }
        if (e && typeof e === 'object') {
          const code = (e as Record<string, string>)['code'];
          const msg = (e as Record<string, string>)['message'];
          return this._resolveMsg(msg, code);
        }
      }
    }

    return this.t('backend_errors.fallback');
  }

  private _resolveMsg(
    msg: string | undefined,
    code: string | undefined,
  ): string {
    // Prefer a mapped i18n translation for the DRF error code
    if (code) {
      const key = `backend_errors.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    // Fall back to the raw message from the server
    return msg ?? this.t('backend_errors.fallback');
  }

  private t(key: string): string {
    return this.translate.instant(key);
  }
}
