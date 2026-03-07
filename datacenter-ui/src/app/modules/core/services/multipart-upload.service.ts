import { HttpClient } from '@angular/common/http';
import { inject, Inject, Injectable, Optional } from '@angular/core';
import { Observable } from 'rxjs';
import { BASE_PATH, Configuration } from '../api/v1';
import { AssetModel } from '../api/v1/model/assetModel';
import { GenericComponent } from '../api/v1/model/genericComponent';

/**
 * Wraps multipart/form-data POST and PATCH requests for resources that
 * include image uploads (AssetModel, GenericComponent).
 *
 * The generated OpenAPI services do not handle FormData directly, so this
 * service provides a thin wrapper that reuses the same base URL resolved
 * from the shared Configuration token.
 */
@Injectable({ providedIn: 'root' })
export class MultipartUploadService {
  private readonly http = inject(HttpClient);
  private readonly basePath: string;

  constructor(
    @Optional() configuration?: Configuration,
    @Optional() @Inject(BASE_PATH) basePath?: string | string[],
  ) {
    const first = Array.isArray(basePath) ? basePath[0] : basePath;
    this.basePath = configuration?.basePath ?? first ?? 'http://localhost';
  }

  /**
   * Create (POST) or update (PATCH) an AssetModel.
   * Pass `id` to update an existing record, omit to create.
   */
  saveAssetModel(fd: FormData, id?: number | null): Observable<AssetModel> {
    const base = `${this.basePath}/asset/asset_model`;
    return id != null
      ? this.http.patch<AssetModel>(`${base}/${id}`, fd)
      : this.http.post<AssetModel>(base, fd);
  }

  /**
   * Create (POST) or update (PATCH) a GenericComponent.
   * Pass `id` to update an existing record, omit to create.
   */
  saveGenericComponent(
    fd: FormData,
    id?: number | null,
  ): Observable<GenericComponent> {
    const base = `${this.basePath}/asset/generic_component`;
    return id != null
      ? this.http.patch<GenericComponent>(`${base}/${id}`, fd)
      : this.http.post<GenericComponent>(base, fd);
  }

  /**
   * Import an AssetModel from a JSON payload (POST /asset/asset-model/import).
   */
  importAssetModel(payload: unknown): Observable<AssetModel> {
    return this.http.post<AssetModel>(
      `${this.basePath}/asset/asset-model/import`,
      payload,
    );
  }
}
