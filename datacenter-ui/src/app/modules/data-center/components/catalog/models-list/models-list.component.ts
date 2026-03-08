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
  ASSET_MODEL_PORT_TYPES,
  AssetModelPort,
  AssetModelPortSide,
  AssetModelPortType,
} from '../../../../core/api/v1/model/assetModelPort';
import { PortTypeEnum } from '../../../../core/api/v1/model/portTypeEnum';
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from '../../../../core/constants';
import { BackendErrorService } from '../../../../core/services/backend-error.service';
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
import {
  ImageEditorComponent,
  ImageEditParams,
} from './image-editor/image-editor.component';
import {
  PortAddEvent,
  PortEditEvent,
  PortPickEvent,
  PortsMapComponent,
} from './ports-map/ports-map.component';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

type ImportState = 'idle' | 'importing' | 'error' | 'conflict' | 'bad_format';
type ExportState = 'idle' | 'exporting' | 'error';
type CatalogImportState = 'idle' | 'importing' | 'error' | 'bad_format';

export interface ModelForm {
  name: string;
  vendor_id: number | null;
  type_id: number | null;
  rack_units: number | null;
  note: string;
  front_image_file: File | null;
  rear_image_file: File | null;
  front_image_url: string | null;
  rear_image_url: string | null;
  front_transform: ImageEditParams | null;
  rear_transform: ImageEditParams | null;
  front_preview_url: string | null;
  rear_preview_url: string | null;
}

function emptyForm(): ModelForm {
  return {
    name: '',
    vendor_id: null,
    type_id: null,
    rack_units: null,
    note: '',
    front_image_file: null,
    rear_image_file: null,
    front_image_url: null,
    rear_image_url: null,
    front_transform: null,
    rear_transform: null,
    front_preview_url: null,
    rear_preview_url: null,
  };
}

@Component({
  selector: 'app-models-list',
  standalone: true,
  imports: [SlicePipe, TranslatePipe, ImageEditorComponent, PortsMapComponent],
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsListComponent {
  private readonly svc = inject(AssetService);
  protected readonly role = inject(RoleService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly backendErr = inject(BackendErrorService);
  private readonly uploadSvc = inject(MultipartUploadService);
  private readonly http = inject(HttpClient);

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

  // ── Drawer (create / edit) ────────────────────────────────────────────────
  protected readonly drawerOpen = signal(false);
  protected readonly drawerMode = signal<'create' | 'edit'>('create');
  protected readonly drawerEditId = signal<number | null>(null);
  protected readonly form = signal<ModelForm>(emptyForm());
  protected readonly drawerSave = signal<DestroyableState>('idle');
  protected readonly drawerSaveMsg = signal('');

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

  // ── Image editor ──────────────────────────────────────────────────────────
  /** Which image side is currently open in the editor ('front' | 'rear' | null) */
  protected readonly editingImage = signal<'front' | 'rear' | null>(null);

  // ── Ports ─────────────────────────────────────────────────────────────────
  protected readonly ports = signal<AssetModelPort[]>([]);
  protected readonly portsLoading = signal(false);
  protected readonly portTypes = ASSET_MODEL_PORT_TYPES;

  protected readonly frontPorts = computed(() =>
    this.ports().filter((p) => p.side === ('front' as const)),
  );
  protected readonly rearPorts = computed(() =>
    this.ports().filter((p) => p.side === ('rear' as const)),
  );

  // Port inline form
  protected readonly portFormOpen = signal(false);
  protected readonly portFormMode = signal<'create' | 'edit'>('create');
  protected readonly portEditId = signal<number | null>(null);
  protected readonly portForm = signal<{
    name: string;
    port_type: AssetModelPortType;
    side: AssetModelPortSide;
    notes: string;
  }>({ name: '', port_type: 'RJ45', side: 'rear', notes: '' });
  protected readonly portSaveState = signal<'idle' | 'saving' | 'error'>(
    'idle',
  );
  protected readonly portDeleteId = signal<number | null>(null);
  protected readonly portDeleteState = signal<'idle' | 'saving' | 'error'>(
    'idle',
  );

  /** Fullscreen ports map state. */
  protected readonly portsMapOpen = signal<{
    side: 'front' | 'rear';
    imageUrl: string;
    readonly: boolean;
  } | null>(null);

  /** Port id currently being positioned by clicking on the fullscreen image. */
  protected readonly placingPortId = signal<number | null>(null);

  // ── Autocomplete inputs for vendor / type ─────────────────────────────────
  protected readonly vendorSearch = signal('');
  protected readonly vendorDropdownOpen = signal(false);
  protected readonly typeSearch = signal('');
  protected readonly typeDropdownOpen = signal(false);

  protected readonly filteredVendors = signal<Vendor[]>([]);
  protected readonly filteredTypes = signal<AssetType[]>([]);

  private readonly _vendorAcInput = new Subject<string>();
  private readonly _typeAcInput = new Subject<string>();

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

    // Autocomplete vendor — live DB search
    this._vendorAcInput
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) =>
          this.svc
            .assetVendorList({
              search: q || undefined,
              pageSize: 25,
              ordering: 'name',
            })
            .pipe(
              map((r) => r.results ?? []),
              catchError(() => of([] as Vendor[])),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => this.filteredVendors.set(list));

    // Autocomplete type — live DB search
    this._typeAcInput
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) =>
          this.svc
            .assetAssetTypeList({
              search: q || undefined,
              pageSize: 25,
              ordering: 'name',
            })
            .pipe(
              map((r) => r.results ?? []),
              catchError(() => of([] as AssetType[])),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => this.filteredTypes.set(list));

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

  // ── Drawer ────────────────────────────────────────────────────────────────
  protected openCreate(): void {
    this.form.set(emptyForm());
    this.vendorSearch.set('');
    this.typeSearch.set('');
    this.vendorDropdownOpen.set(false);
    this.typeDropdownOpen.set(false);
    this.drawerSave.set('idle');
    this.drawerSaveMsg.set('');
    this.drawerMode.set('create');
    this.drawerEditId.set(null);
    this.drawerOpen.set(true);
  }

  protected openEdit(m: AssetModel): void {
    this.vendorSearch.set(m.vendor?.name ?? '');
    this.typeSearch.set(m.type?.name ?? '');
    this.vendorDropdownOpen.set(false);
    this.typeDropdownOpen.set(false);
    this.form.set({
      name: m.name ?? '',
      vendor_id: m.vendor?.id ?? null,
      type_id: m.type?.id ?? null,
      rack_units: m.rack_units ?? null,
      note: m.note ?? '',
      front_image_file: null,
      rear_image_file: null,
      front_image_url: m.front_image ?? null,
      rear_image_url: m.rear_image ?? null,
      front_transform: null,
      rear_transform: null,
      front_preview_url: null,
      rear_preview_url: null,
    });
    this.drawerSave.set('idle');
    this.drawerSaveMsg.set('');
    this.drawerMode.set('edit');
    this.drawerEditId.set(m.id);
    this.drawerOpen.set(true);
    this.loadPortsForModel(m.id);
  }

  protected cloneModel(m: AssetModel): void {
    this.vendorSearch.set(m.vendor?.name ?? '');
    this.typeSearch.set(m.type?.name ?? '');
    this.vendorDropdownOpen.set(false);
    this.typeDropdownOpen.set(false);
    this.form.set({
      name: `(CLONE) ${m.name ?? ''}`,
      vendor_id: m.vendor?.id ?? null,
      type_id: m.type?.id ?? null,
      rack_units: m.rack_units ?? null,
      note: m.note ?? '',
      front_image_file: null,
      rear_image_file: null,
      front_image_url: m.front_image ?? null,
      rear_image_url: m.rear_image ?? null,
      front_transform: null,
      rear_transform: null,
      front_preview_url: null,
      rear_preview_url: null,
    });
    this.drawerSave.set('idle');
    this.drawerSaveMsg.set('');
    this.drawerMode.set('create');
    this.drawerEditId.set(null);
    this.drawerOpen.set(true);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
    this.ports.set([]);
    this.portFormOpen.set(false);
    this.portEditId.set(null);
    this.portsMapOpen.set(null);
    this.placingPortId.set(null);
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
    this.openEdit(m);
  }

  protected setField<K extends keyof ModelForm>(
    key: K,
    value: ModelForm[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected readonly canSave = computed(() => {
    const f = this.form();
    return !!f.name.trim() && f.vendor_id !== null && f.type_id !== null;
  });

  protected objectUrl(file: File): string {
    return URL.createObjectURL(file);
  }

  /**
   * Appends a ?w=<width> query param to an image URL so the backend
   * serves a resized variant instead of the full-resolution original.
   */
  protected imgW(url: string | null | undefined, w: number): string {
    if (!url) return '';
    return url.includes('?') ? `${url}&w=${w}` : `${url}?w=${w}`;
  }

  protected onFileChange(
    field: 'front_image_file' | 'rear_image_file',
    event: Event,
  ): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.form.update((f) => ({ ...f, [field]: file }));
  }

  protected clearImage(field: 'front_image_url' | 'rear_image_url'): void {
    this.form.update((f) => ({ ...f, [field]: null }));
  }

  // ── Image editor ──────────────────────────────────────────────────────────

  protected openImageEditor(side: 'front' | 'rear'): void {
    this.editingImage.set(side);
  }

  protected onEditorConfirmed(
    event: { params: ImageEditParams; previewDataUrl: string },
    side: 'front' | 'rear',
  ): void {
    if (side === 'front') {
      this.form.update((f) => ({
        ...f,
        front_transform: event.params,
        front_preview_url: event.previewDataUrl,
      }));
    } else {
      this.form.update((f) => ({
        ...f,
        rear_transform: event.params,
        rear_preview_url: event.previewDataUrl,
      }));
    }
    this.editingImage.set(null);
  }

  protected onEditorCancelled(): void {
    this.editingImage.set(null);
  }

  protected onVendorFocus(): void {
    this.vendorDropdownOpen.set(true);
    this._vendorAcInput.next(this.vendorSearch());
  }

  protected onVendorSearch(value: string): void {
    this.vendorSearch.set(value);
    this.vendorDropdownOpen.set(true);
    this._vendorAcInput.next(value);
    if (!value) this.form.update((f) => ({ ...f, vendor_id: null }));
  }

  protected selectVendor(v: Vendor): void {
    this.form.update((f) => ({ ...f, vendor_id: v.id }));
    this.vendorSearch.set(v.name);
    this.vendorDropdownOpen.set(false);
  }

  protected clearVendor(): void {
    this.form.update((f) => ({ ...f, vendor_id: null }));
    this.vendorSearch.set('');
    this.vendorDropdownOpen.set(false);
    this._vendorAcInput.next('');
  }

  protected onTypeFocus(): void {
    this.typeDropdownOpen.set(true);
    this._typeAcInput.next(this.typeSearch());
  }

  protected onTypeSearch(value: string): void {
    this.typeSearch.set(value);
    this.typeDropdownOpen.set(true);
    this._typeAcInput.next(value);
    if (!value) this.form.update((f) => ({ ...f, type_id: null }));
  }

  protected selectType(t: AssetType): void {
    this.form.update((f) => ({ ...f, type_id: t.id }));
    this.typeSearch.set(t.name);
    this.typeDropdownOpen.set(false);
  }

  protected clearType(): void {
    this.form.update((f) => ({ ...f, type_id: null }));
    this.typeSearch.set('');
    this.typeDropdownOpen.set(false);
    this._typeAcInput.next('');
  }

  /** Returns true if the form has any non-identity transforms configured. */
  protected hasTransform(side: 'front' | 'rear'): boolean {
    const t =
      side === 'front'
        ? this.form().front_transform
        : this.form().rear_transform;
    if (!t) return false;
    return (
      !!t.perspective || !!t.crop || t.rotation !== 0 || t.flipH || t.flipV
    );
  }

  protected submitDrawer(): void {
    if (!this.canSave()) return;
    const f = this.form();

    const fd = new FormData();
    fd.append('name', f.name.trim());
    fd.append('vendor_id', String(f.vendor_id));
    fd.append('type_id', String(f.type_id));
    if (f.rack_units != null) fd.append('rack_units', String(f.rack_units));
    fd.append('note', f.note ?? '');
    if (f.front_image_file) {
      fd.append('front_image', f.front_image_file);
      if (f.front_transform)
        fd.append('front_image_transform', JSON.stringify(f.front_transform));
    } else if (f.front_image_url === null && this.drawerMode() === 'edit') {
      fd.append('front_image', '');
    } else if (f.front_image_url && f.front_transform) {
      // Existing image with editor transforms — send params only; backend applies to stored file
      fd.append('front_image_transform', JSON.stringify(f.front_transform));
    }
    if (f.rear_image_file) {
      fd.append('rear_image', f.rear_image_file);
      if (f.rear_transform)
        fd.append('rear_image_transform', JSON.stringify(f.rear_transform));
    } else if (f.rear_image_url === null && this.drawerMode() === 'edit') {
      fd.append('rear_image', '');
    } else if (f.rear_image_url && f.rear_transform) {
      fd.append('rear_image_transform', JSON.stringify(f.rear_transform));
    }

    this.drawerSave.set('saving');
    const req$ = this.uploadSvc.saveAssetModel(fd, this.drawerEditId());

    req$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.drawerSave.set('idle');
        this.drawerOpen.set(false);
        if (
          this.drawerMode() === 'create' ||
          this.listState().status !== 'loaded'
        ) {
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
      },
      error: (err: HttpErrorResponse) => {
        this.drawerSave.set('error');
        this.drawerSaveMsg.set(this.backendErr.parse(err));
      },
    });
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

  // ── Ports ─────────────────────────────────────────────────────────────────

  protected loadPortsForModel(modelId: number): void {
    this.portsLoading.set(true);
    this.svc
      .assetAssetModelPortList({ assetModel: modelId, pageSize: 500 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.ports.set(r.results ?? []);
          this.portsLoading.set(false);
        },
        error: () => this.portsLoading.set(false),
      });
  }

  protected openPortCreate(): void {
    this.portFormMode.set('create');
    this.portEditId.set(null);
    this.portForm.set({ name: '', port_type: 'RJ45', side: 'rear', notes: '' });
    this.portSaveState.set('idle');
    this.portFormOpen.set(true);
  }

  protected openPortEdit(p: AssetModelPort): void {
    this.portFormMode.set('edit');
    this.portEditId.set(p.id);
    this.portForm.set({
      name: p.name,
      port_type: p.port_type ?? 'RJ45',
      side: p.side ?? 'rear',
      notes: p.notes ?? '',
    });
    this.portSaveState.set('idle');
    this.portFormOpen.set(true);
  }

  protected setPortField<K extends keyof ReturnType<typeof this.portForm>>(
    key: K,
    value: ReturnType<typeof this.portForm>[K],
  ): void {
    this.portForm.update((f) => ({ ...f, [key]: value }));
  }

  protected submitPortForm(): void {
    const modelId = this.drawerEditId();
    if (!modelId) return;
    const f = this.portForm();
    if (!f.name.trim()) return;

    this.portSaveState.set('saving');

    if (this.portFormMode() === 'create') {
      this.svc
        .assetAssetModelPortCreate({
          assetModelPort: {
            asset_model: modelId,
            name: f.name.trim(),
            port_type: f.port_type,
            side: f.side,
            notes: f.notes,
            pos_x: null,
            pos_y: null,
          } as AssetModelPort,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (saved: AssetModelPort) => {
            this.ports.update((prev) => [...prev, saved]);
            this.portSaveState.set('idle');
            this.portFormOpen.set(false);
          },
          error: () => this.portSaveState.set('error'),
        });
    } else {
      const id = this.portEditId()!;
      this.svc
        .assetAssetModelPortPartialUpdate({
          id,
          patchedAssetModelPort: {
            name: f.name.trim(),
            port_type: f.port_type,
            side: f.side,
            notes: f.notes,
          },
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (saved: AssetModelPort) => {
            this.ports.update((prev) =>
              prev.map((p) => (p.id === id ? saved : p)),
            );
            this.portSaveState.set('idle');
            this.portFormOpen.set(false);
          },
          error: () => this.portSaveState.set('error'),
        });
    }
  }

  protected confirmDeletePort(id: number): void {
    this.portDeleteId.set(id);
    this.portDeleteState.set('idle');
  }

  protected cancelDeletePort(): void {
    this.portDeleteId.set(null);
  }

  protected submitDeletePort(): void {
    const id = this.portDeleteId();
    if (!id) return;
    this.portDeleteState.set('saving');
    this.svc
      .assetAssetModelPortDestroy({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ports.update((prev) => prev.filter((p) => p.id !== id));
          this.portDeleteId.set(null);
          this.portDeleteState.set('idle');
          if (this.placingPortId() === id) this.placingPortId.set(null);
        },
        error: () => this.portDeleteState.set('error'),
      });
  }

  /** Opens fullscreen ports map for the given side. */
  protected openPortsMap(
    side: string | undefined,
    imageUrl: string,
    readonly: boolean,
  ): void {
    this.portsMapOpen.set({
      side: (side || 'front') as 'front' | 'rear',
      imageUrl,
      readonly,
    });
    if (!readonly) this.placingPortId.set(null);
  }

  protected closePortsMap(): void {
    this.portsMapOpen.set(null);
    this.placingPortId.set(null);
  }

  /** Returns ports for the currently open map side. */
  protected readonly portsForMap = computed(() => {
    const map = this.portsMapOpen();
    if (!map) return [];
    // For preview panel, read from previewModel.ports; for edit drawer use local ports signal.
    if (!map.readonly) {
      return this.ports().filter((p) => (p.side as string) === map.side);
    }
    return (this.previewModel()?.ports ?? []).filter(
      (p) => (p.side as string) === map.side,
    );
  });

  /** Enters "place" mode: next image click will set position for this port. */
  protected startPlacingPort(portId: number): void {
    this.placingPortId.set(portId);
  }

  protected stopPlacingPort(): void {
    this.placingPortId.set(null);
  }

  /** Called when the user clicks on the fullscreen image to place a port. */
  protected onPortPicked(event: PortPickEvent): void {
    this.svc
      .assetAssetModelPortPartialUpdate({
        id: event.portId,
        patchedAssetModelPort: { pos_x: event.pos_x, pos_y: event.pos_y },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved: AssetModelPort) => {
          this.ports.update((prev) =>
            prev.map((p) => (p.id === saved.id ? saved : p)),
          );
          this.placingPortId.set(null);
        },
      });
  }

  protected clearPortPosition(portId: number): void {
    this.svc
      .assetAssetModelPortPartialUpdate({
        id: portId,
        patchedAssetModelPort: { pos_x: null, pos_y: null },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved: AssetModelPort) => {
          this.ports.update((prev) =>
            prev.map((p) => (p.id === saved.id ? saved : p)),
          );
        },
      });
  }

  protected portTypeLabel(type: AssetModelPortType | undefined): string {
    if (!type) return '';
    return (
      ASSET_MODEL_PORT_TYPES.find(
        (t: { value: PortTypeEnum; label: string }) => t.value === type,
      )?.label ?? type
    );
  }

  // ── Port map events ─────────────────────────────────────────────────────────

  protected onPortAddedFromMap(event: PortAddEvent): void {
    const modelId = this.drawerEditId();
    if (!modelId) return;
    const side = this.portsMapOpen()?.side ?? 'rear';
    this.svc
      .assetAssetModelPortCreate({
        assetModelPort: {
          asset_model: modelId,
          name: event.name,
          port_type: event.port_type,
          side,
          notes: '',
          pos_x: event.pos_x,
          pos_y: event.pos_y,
        } as AssetModelPort,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved: AssetModelPort) =>
          this.ports.update((prev) => [...prev, saved]),
      });
  }

  protected onPortRemovedFromMap(portId: number): void {
    this.svc
      .assetAssetModelPortDestroy({ id: portId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ports.update((prev) => prev.filter((p) => p.id !== portId));
          if (this.placingPortId() === portId) this.placingPortId.set(null);
        },
      });
  }

  protected onPortEditedFromMap(event: PortEditEvent): void {
    this.svc
      .assetAssetModelPortPartialUpdate({
        id: event.portId,
        patchedAssetModelPort: { name: event.name, port_type: event.port_type },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved: AssetModelPort) =>
          this.ports.update((prev) =>
            prev.map((p) => (p.id === saved.id ? saved : p)),
          ),
      });
  }
}
