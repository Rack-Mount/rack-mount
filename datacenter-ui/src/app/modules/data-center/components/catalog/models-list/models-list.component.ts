import { SlicePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import {
  catchError,
  concat,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import {
  AssetModel,
  AssetService,
  AssetType,
  Vendor,
} from '../../../../core/api/v1';
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from '../../../../core/constants';
import { MeasurementPipe } from '../../../../core/pipes/measurement.pipe';
import {
  CatalogImportResult,
  MultipartUploadService,
} from '../../../../core/services/multipart-upload.service';
import { RoleService } from '../../../../core/services/role.service';
import {
  DestroyableState,
  PaginatedListState,
} from '../../../../core/types/list-state.types';
import { toggleSort } from '../../../../core/utils/sort.utils';
import { ModelFormDrawerComponent } from './model-form-drawer.component';
import { ModelFormDrawerService } from './model-form-drawer.service';
import { ModelPortsService } from './model-ports.service';
import {
  type PortAddEvent,
  type PortEditEvent,
  type PortPickEvent,
  PortsMapComponent,
} from './ports-map/ports-map.component';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

type ImportState = 'idle' | 'importing' | 'error' | 'conflict' | 'bad_format';
type ExportState = 'idle' | 'exporting' | 'error';
type CatalogImportState = 'idle' | 'importing' | 'error' | 'bad_format';

// ModelForm is exported from models-list.types.ts — re-export for backward compatibility
export type { ModelForm } from './models-list.types';

@Component({
  selector: 'app-models-list',
  standalone: true,
  imports: [
    SlicePipe,
    TranslatePipe,
    MeasurementPipe,
    ModelFormDrawerComponent,
    PortsMapComponent,
  ],
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ModelPortsService, ModelFormDrawerService],
})
export class ModelsListComponent {
  private readonly portsSvc = inject(ModelPortsService);
  protected readonly drawerSvc = inject(ModelFormDrawerService);
  private readonly svc = inject(AssetService);
  protected readonly role = inject(RoleService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uploadSvc = inject(MultipartUploadService);
  private readonly http = inject(HttpClient);

  /**
   * Appends a ?w=<width> query param to an image URL so the backend
   * serves a resized variant instead of the full-resolution original.
   */
  protected imgW(url: string | null | undefined, w: number): string {
    if (!url) return '';
    return url.includes('?') ? `${url}&w=${w}` : `${url}?w=${w}`;
  }

  // ── Reference data ────────────────────────────────────────────────────────
  protected readonly vendors = signal<Vendor[]>([]);
  protected readonly types = signal<AssetType[]>([]);

  // ── Filter params ─────────────────────────────────────────────────────────
  protected readonly search = signal('');
  protected readonly vendorFilter = signal<number | null>(null);
  protected readonly typeFilter = signal<number | null>(null);
  protected readonly page = signal(1);
  protected readonly ordering = signal<string>('name');
  private readonly _searchInput = new Subject<string>();

  protected readonly sortField = computed(() =>
    this.ordering().replace(/^-/, ''),
  );
  protected readonly sortDir = computed(() =>
    this.ordering().startsWith('-') ? 'desc' : 'asc',
  );

  // ── List state ────────────────────────────────────────────────────────────
  protected readonly listState = signal<PaginatedListState<AssetModel>>({
    status: 'loading',
  });

  protected readonly models = computed(() => {
    const s = this.listState();
    return s.status === 'loaded' ? s.results : [];
  });

  protected readonly totalCount = computed(() => {
    const s = this.listState();
    return s.status === 'loaded' ? s.count : 0;
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)),
  );

  // ── Preview ───────────────────────────────────────────────────────────────
  protected readonly previewModel = signal<AssetModel | null>(null);

  // ── Delete ────────────────────────────────────────────────────────────────
  protected readonly deleteId = signal<number | null>(null);
  protected readonly deleteSave = signal<DestroyableState>('idle');

  // ── Selection ─────────────────────────────────────────────────────────────
  protected readonly selectedIds = signal<Set<number>>(new Set());
  protected readonly isAllSelected = computed(() => {
    const list = this.models();
    if (!list.length) return false;
    return list.every((m) => this.selectedIds().has(m.id));
  });
  protected readonly isSomeSelected = computed(
    () => !this.isAllSelected() && this.selectedIds().size > 0,
  );
  protected readonly selectedCount = computed(() => this.selectedIds().size);

  // ── Bulk delete ────────────────────────────────────────────────────────────
  protected readonly bulkDeleteState = signal<
    'idle' | 'confirm' | 'saving' | 'error'
  >('idle');

  // ── Import ────────────────────────────────────────────────────────────────
  protected readonly importState = signal<ImportState>('idle');

  // ── Export ────────────────────────────────────────────────────────────────
  protected readonly exportState = signal<ExportState>('idle');

  // ── Catalog import ────────────────────────────────────────────────────────
  protected readonly catalogImportState = signal<CatalogImportState>('idle');
  protected readonly catalogImportResult = signal<CatalogImportResult | null>(
    null,
  );

  // ── Ports-map access (for overlay in parent template) ─────────────────────
  protected get portsMapOpen() {
    return this.portsSvc.portsMapOpen;
  }
  protected get placingPortId() {
    return this.portsSvc.placingPortId;
  }

  constructor() {
    // Load reference data (for toolbar filters)
    forkJoin([
      this.svc.assetVendorList({ pageSize: 500, ordering: 'name' }),
      this.svc.assetAssetTypeList({ pageSize: 200, ordering: 'name' }),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([vr, tr]) => {
        this.vendors.set(vr.results ?? []);
        this.types.set(tr.results ?? []);
      });

    // Debounce search
    this._searchInput
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((v) => {
        this.search.set(v);
        this.page.set(1);
      });

    // Drive list
    toObservable(
      computed(() => ({
        search: this.search(),
        vendorFilter: this.vendorFilter(),
        typeFilter: this.typeFilter(),
        page: this.page(),
        ordering: this.ordering(),
      })),
    )
      .pipe(
        switchMap((p) =>
          concat(
            of<PaginatedListState<AssetModel>>({ status: 'loading' }),
            this.svc
              .assetAssetModelList({
                search: p.search || undefined,
                vendor: p.vendorFilter ?? undefined,
                type: p.typeFilter ?? undefined,
                page: p.page,
                pageSize: PAGE_SIZE,
                ordering: p.ordering,
              })
              .pipe(
                map(
                  (r): PaginatedListState<AssetModel> => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() =>
                  of<PaginatedListState<AssetModel>>({ status: 'error' }),
                ),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => {
        this.listState.set(s);
        if (s.status === 'loading') {
          this.selectedIds.set(new Set());
        }
      });

    // Update list when drawer saves a model
    this.drawerSvc.modelSaved
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ saved, mode }) => {
        if (mode === 'create' || this.listState().status !== 'loaded') {
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return { ...s, results: [saved, ...s.results], count: s.count + 1 };
          });
        } else {
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.map((r) => (r.id === saved.id ? saved : r)),
            };
          });
        }
      });
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  protected onSearchInput(v: string): void {
    this._searchInput.next(v);
  }

  protected onVendorFilter(id: string): void {
    this.vendorFilter.set(id ? +id : null);
    this.page.set(1);
  }

  protected onTypeFilter(id: string): void {
    this.typeFilter.set(id ? +id : null);
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.vendorFilter.set(null);
    this.typeFilter.set(null);
    this.page.set(1);
  }

  // ── Sorting ────────────────────────────────────────────────────────────────
  protected sort(field: string): void {
    this.ordering.set(toggleSort(this.ordering(), field));
    this.page.set(1);
  }

  protected readonly hasFilters = computed(
    () =>
      !!this.search() ||
      this.vendorFilter() !== null ||
      this.typeFilter() !== null,
  );

  // ── Drawer shortcuts ──────────────────────────────────────────────────────
  protected openCreate(): void {
    this.drawerSvc.openCreate();
  }

  protected openEdit(m: AssetModel): void {
    this.drawerSvc.openEdit(m);
  }

  protected cloneModel(m: AssetModel): void {
    this.drawerSvc.cloneModel(m);
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  protected openPreview(m: AssetModel): void {
    this.previewModel.set(m);
  }

  protected closePreview(): void {
    this.previewModel.set(null);
  }

  protected previewEdit(): void {
    const m = this.previewModel();
    if (!m) return;
    this.closePreview();
    this.drawerSvc.openEdit(m);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  protected confirmDelete(id: number): void {
    this.deleteId.set(id);
    this.deleteSave.set('idle');
  }

  protected cancelDelete(): void {
    this.deleteId.set(null);
  }

  protected submitDelete(): void {
    const id = this.deleteId();
    if (!id) return;
    this.deleteSave.set('saving');
    this.svc
      .assetAssetModelDestroy({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteSave.set('idle');
          this.deleteId.set(null);
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.filter((r) => r.id !== id),
              count: Math.max(0, s.count - 1),
            };
          });
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 409) {
            this.deleteSave.set('in_use');
          } else {
            this.deleteSave.set('error');
          }
        },
      });
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  protected goPage(p: number): void {
    this.page.set(p);
  }

  protected readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const cur = this.page();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) {
      pages.push(i);
    }
    return pages;
  });

  // ── JSON Export ───────────────────────────────────────────────────────────
  protected onExportCatalog(): void {
    if (this.exportState() === 'exporting') return;
    this.exportState.set('exporting');
    this.uploadSvc
      .exportCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.exportState.set('idle');
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const date = new Date().toISOString().slice(0, 10);
          a.href = url;
          a.download = `catalog-export-${date}.json`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.exportState.set('error');
          setTimeout(() => this.exportState.set('idle'), 3000);
        },
      });
  }

  // ── Catalog JSON Import ───────────────────────────────────────────────────
  protected onImportCatalogJson(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let payload: unknown;
      try {
        payload = JSON.parse(reader.result as string);
      } catch {
        this.catalogImportState.set('bad_format');
        return;
      }

      this.catalogImportState.set('importing');
      this.catalogImportResult.set(null);
      this.uploadSvc
        .importCatalog(payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            this.catalogImportState.set('idle');
            this.catalogImportResult.set(result);
            // Refresh the list so newly imported models are visible
            this.page.set(1);
          },
          error: () => {
            this.catalogImportState.set('error');
          },
        });
    };
    reader.readAsText(file);
  }

  // ── JSON Import ───────────────────────────────────────────────────────────
  protected onImportJson(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let payload: unknown;
      try {
        payload = JSON.parse(reader.result as string);
      } catch {
        this.importState.set('bad_format');
        return;
      }

      this.importState.set('importing');
      this.uploadSvc
        .importAssetModel(payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (saved) => {
            this.importState.set('idle');
            this.listState.update((s) => {
              if (s.status !== 'loaded') return s;
              return {
                ...s,
                results: [saved, ...s.results],
                count: s.count + 1,
              };
            });
            this.previewModel.set(saved);
          },
          error: (err: HttpErrorResponse) => {
            this.importState.set(err.status === 409 ? 'conflict' : 'error');
          },
        });
    };
    reader.readAsText(file);
  }

  // ── Multi-select ──────────────────────────────────────────────────────────
  protected toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.models().map((m) => m.id)));
    }
  }

  protected toggleSelectRow(id: number, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedIds.update((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
    this.bulkDeleteState.set('idle');
  }

  protected onBulkDeleteClicked(): void {
    this.bulkDeleteState.set('confirm');
  }

  protected onBulkDeleteCancelled(): void {
    this.bulkDeleteState.set('idle');
  }

  protected onBulkDeleteConfirmed(): void {
    this.bulkDeleteState.set('saving');
    const ids = [...this.selectedIds()];
    this.http
      .post<{ deleted: number; skipped: number }>(
        `${environment.service_url}/asset/asset_model/bulk_delete`,
        { ids },
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ deleted }) => {
          this.bulkDeleteState.set('idle');
          const deletedSet = new Set(ids);
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.filter((r) => !deletedSet.has(r.id)),
              count: Math.max(0, s.count - deleted),
            };
          });
          this.selectedIds.set(new Set());
        },
        error: () => {
          this.bulkDeleteState.set('error');
          setTimeout(() => this.bulkDeleteState.set('idle'), 3000);
        },
      });
  }

  // ── Ports-map (stays in parent for preview panel + overlay) ───────────────
  protected openPortsMap(
    side: string | undefined,
    imageUrl: string,
    readonly: boolean,
  ): void {
    this.portsSvc.openPortsMap(side, imageUrl, readonly);
  }

  protected closePortsMap(): void {
    this.portsSvc.closePortsMap();
  }

  protected onPortPicked(event: PortPickEvent): void {
    this.portsSvc.onPortPicked(event);
  }

  protected onPortAddedFromMap(event: PortAddEvent): void {
    this.portsSvc.onPortAddedFromMap(event, this.drawerSvc.drawerEditId());
  }

  protected onPortRemovedFromMap(portId: number): void {
    this.portsSvc.onPortRemovedFromMap(portId);
  }

  protected onPortEditedFromMap(event: PortEditEvent): void {
    this.portsSvc.onPortEditedFromMap(event);
  }

  /** Returns ports for the currently open map side. */
  protected readonly portsForMap = computed(() => {
    const map = this.portsSvc.portsMapOpen();
    if (!map) return [];
    if (!map.readonly) {
      return this.portsSvc
        .ports()
        .filter((p) => (p.side as string) === map.side);
    }
    return (this.previewModel()?.ports ?? []).filter(
      (p) => (p.side as string) === map.side,
    );
  });
}
