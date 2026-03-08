import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BASE_PATH, Configuration } from '../api/v1';
import { Asset } from '../api/v1/model/asset';

export interface ImportCsvResult {
  created: number;
  rows: { row: number; hostname: string; serial_number: string }[];
  errors: { row: number; message: string }[];
}

/**
 * Wraps custom Asset API actions that are not covered by the generated
 * OpenAPI service (bulk operations, clone, CSV import).
 */
@Injectable({ providedIn: 'root' })
export class AssetActionsService {
  private readonly http = inject(HttpClient);
  private readonly basePath: string = (() => {
    const configuration = inject(Configuration, { optional: true });
    const base = inject(BASE_PATH, { optional: true }) as
      | string
      | string[]
      | null;
    const first = Array.isArray(base) ? base[0] : base;
    return configuration?.basePath ?? first ?? 'http://localhost';
  })();

  importCsv(file: File): Observable<ImportCsvResult> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ImportCsvResult>(
      `${this.basePath}/asset/asset/import-csv`,
      fd,
    );
  }

  clone(assetId: number): Observable<Asset> {
    return this.http.post<Asset>(
      `${this.basePath}/asset/asset/${assetId}/clone`,
      {},
    );
  }

  bulkClone(ids: number[]): Observable<{ created: number }> {
    return this.http.post<{ created: number }>(
      `${this.basePath}/asset/asset/bulk_clone`,
      { ids },
    );
  }

  bulkState(
    stateId: number,
    filters: {
      search?: string;
      stateId?: number | null;
      typeId?: number | null;
    },
  ): Observable<{ updated: number }> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.stateId != null)
      params = params.set('state', String(filters.stateId));
    if (filters.typeId != null)
      params = params.set('model__type', String(filters.typeId));
    return this.http.patch<{ updated: number }>(
      `${this.basePath}/asset/asset/bulk_state`,
      { state_id: stateId },
      { params },
    );
  }

  bulkDelete(
    options:
      | { ids: number[] }
      | {
          allPages: true;
          search?: string;
          stateId?: number | null;
          typeId?: number | null;
        },
  ): Observable<{ deleted: number; skipped: number }> {
    if ('ids' in options) {
      return this.http.post<{ deleted: number; skipped: number }>(
        `${this.basePath}/asset/asset/bulk_delete`,
        { ids: options.ids },
      );
    }
    let params = new HttpParams();
    if (options.search) params = params.set('search', options.search);
    if (options.stateId != null)
      params = params.set('state', String(options.stateId));
    if (options.typeId != null)
      params = params.set('model__type', String(options.typeId));
    return this.http.post<{ deleted: number; skipped: number }>(
      `${this.basePath}/asset/asset/bulk_delete`,
      {},
      { params },
    );
  }
}
