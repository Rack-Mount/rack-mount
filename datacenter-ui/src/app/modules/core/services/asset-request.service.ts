import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AssetRequest,
  AssetRequestCreate,
  PaginatedAssetRequests,
} from '../models/asset-request.model';

@Injectable({ providedIn: 'root' })
export class AssetRequestService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.service_url}/api/asset/asset_request`;

  list(filters: {
    asset?: number;
    status?: string;
    request_type?: string;
    page?: number;
    pageSize?: number;
  } = {}): Observable<PaginatedAssetRequests> {
    let params = new HttpParams();
    if (filters.asset != null)        params = params.set('asset', filters.asset);
    if (filters.status)               params = params.set('status', filters.status);
    if (filters.request_type)         params = params.set('request_type', filters.request_type);
    if (filters.page != null)         params = params.set('page', filters.page);
    if (filters.pageSize != null)     params = params.set('page_size', filters.pageSize);
    return this.http.get<PaginatedAssetRequests>(this.base, { params });
  }

  retrieve(id: number): Observable<AssetRequest> {
    return this.http.get<AssetRequest>(`${this.base}/${id}`);
  }

  create(body: AssetRequestCreate): Observable<AssetRequest> {
    return this.http.post<AssetRequest>(this.base, body);
  }

  plan(id: number, body: { planned_date?: string | null; assigned_to?: number | null; notes?: string }): Observable<AssetRequest> {
    return this.http.post<AssetRequest>(`${this.base}/${id}/plan`, body);
  }

  execute(id: number): Observable<AssetRequest> {
    return this.http.post<AssetRequest>(`${this.base}/${id}/execute`, {});
  }

  reject(id: number, body: { rejection_notes: string }): Observable<AssetRequest> {
    return this.http.post<AssetRequest>(`${this.base}/${id}/reject`, body);
  }

  clarify(id: number, body: { clarification_notes: string }): Observable<AssetRequest> {
    return this.http.post<AssetRequest>(`${this.base}/${id}/clarify`, body);
  }

  resubmit(id: number, body: { notes?: string }): Observable<AssetRequest> {
    return this.http.post<AssetRequest>(`${this.base}/${id}/resubmit`, body);
  }
}
