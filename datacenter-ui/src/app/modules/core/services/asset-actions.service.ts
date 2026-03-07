import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Inject, Injectable, Optional } from '@angular/core';
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
  private readonly basePath: string;

  constructor(
    @Optional() configuration?: Configuration,
    @Optional() @Inject(BASE_PATH) basePath?: string | string[],
  ) {
    const first = Array.isArray(basePath) ? basePath[0] : basePath;
    this.basePath = configuration?.basePath ?? first ?? 'http://localhost';
  }

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
}
