import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AssetNetworkInterface,
  MediaTypeEnum,
  PaginatedAssetNetworkInterfaceList,
  PortCountEnum,
  SideEnum,
  SpeedEnum,
} from '../api/v1';

export interface AssetNetworkInterfaceWrite {
  asset: number;
  name: string;
  media_type: MediaTypeEnum;
  port_count: PortCountEnum;
  speed: SpeedEnum;
  slot?: string;
  notes?: string;
  side?: SideEnum;
  pos_x?: number | null;
  pos_y?: number | null;
  width?: number | null;
  height?: number | null;
}

@Injectable({ providedIn: 'root' })
export class AssetNetworkInterfaceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.service_url}/asset/network_interface`;

  list(assetId: number): Observable<PaginatedAssetNetworkInterfaceList> {
    return this.http.get<PaginatedAssetNetworkInterfaceList>(this.base, {
      params: { asset: assetId, page_size: 100 },
    });
  }

  create(body: AssetNetworkInterfaceWrite): Observable<AssetNetworkInterface> {
    return this.http.post<AssetNetworkInterface>(this.base, body);
  }

  update(
    id: number,
    body: AssetNetworkInterfaceWrite,
  ): Observable<AssetNetworkInterface> {
    return this.http.put<AssetNetworkInterface>(`${this.base}/${id}`, body);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  patch(
    id: number,
    body: Partial<AssetNetworkInterfaceWrite>,
  ): Observable<AssetNetworkInterface> {
    return this.http.patch<AssetNetworkInterface>(`${this.base}/${id}`, body);
  }
}
