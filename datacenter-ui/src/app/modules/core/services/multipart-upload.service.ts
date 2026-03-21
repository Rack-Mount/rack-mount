import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AssetModel } from '../api/v1/model/assetModel';
import { GenericComponent } from '../api/v1/model/genericComponent';
import { BaseApiService } from './base-api.service';

export interface CatalogImportSectionResult {
  created: number;
  skipped: number;
  errors?: { index: number; message: string }[];
}

export interface CatalogImportResult {
  vendors: CatalogImportSectionResult;
  asset_types: CatalogImportSectionResult;
  asset_models: CatalogImportSectionResult;
  generic_components: CatalogImportSectionResult;
}

/**
 * Wraps multipart/form-data POST and PATCH requests for resources that
 * include image uploads (AssetModel, GenericComponent).
 *
 * The generated OpenAPI services do not handle FormData directly, so this
 * service provides a thin wrapper that reuses the same base URL resolved
 * from the shared Configuration token.
 */
@Injectable({ providedIn: 'root' })
export class MultipartUploadService extends BaseApiService {
  private readonly http = inject(HttpClient);

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

  /**
   * Export the full catalog as JSON (GET /asset/catalog/export).
   * Returns the raw JSON blob so the caller can trigger a file download.
   */
  exportCatalog(): Observable<Blob> {
    return this.http.get(`${this.basePath}/asset/catalog/export`, {
      responseType: 'blob',
    });
  }

  /**
   * Import the full catalog from a JSON payload (POST /asset/catalog/import).
   */
  importCatalog(payload: unknown): Observable<CatalogImportResult> {
    return this.http.post<CatalogImportResult>(
      `${this.basePath}/asset/catalog/import`,
      payload,
    );
  }
}
