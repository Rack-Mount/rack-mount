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
import { BackendErrorService } from '../../../../core/services/backend-error.service';

const PAGE_SIZE = 50;

type SaveState = 'idle' | 'saving' | 'error' | 'in_use';
type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; results: AssetModel[]; count: number };

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
  };
}

@Component({
  selector: 'app-models-list',
  standalone: true,
  imports: [SlicePipe, TranslatePipe],
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsListComponent {
  private readonly svc = inject(AssetService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly backendErr = inject(BackendErrorService);

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
  protected readonly listState = signal<ListState>({ status: 'loading' });

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
  protected readonly drawerSave = signal<SaveState>('idle');
  protected readonly drawerSaveMsg = signal('');

  // ── Preview ───────────────────────────────────────────────────────────────
  protected readonly previewModel = signal<AssetModel | null>(null);

  // ── Delete ────────────────────────────────────────────────────────────────
  protected readonly deleteId = signal<number | null>(null);
  protected readonly deleteSave = signal<SaveState>('idle');

  constructor() {
    // Load reference data
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
        debounceTime(300),
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
            of<ListState>({ status: 'loading' }),
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
                  (r): ListState => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() => of<ListState>({ status: 'error' })),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.listState.set(s));
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
    const cur = this.ordering();
    if (cur === field) {
      this.ordering.set(`-${field}`);
    } else if (cur === `-${field}`) {
      this.ordering.set(field);
    } else {
      this.ordering.set(field);
    }
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
    this.drawerSave.set('idle');
    this.drawerSaveMsg.set('');
    this.drawerMode.set('create');
    this.drawerEditId.set(null);
    this.drawerOpen.set(true);
  }

  protected openEdit(m: AssetModel): void {
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
    });
    this.drawerSave.set('idle');
    this.drawerSaveMsg.set('');
    this.drawerMode.set('edit');
    this.drawerEditId.set(m.id);
    this.drawerOpen.set(true);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
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
    } else if (f.front_image_url === null && this.drawerMode() === 'edit') {
      fd.append('front_image', '');
    }
    if (f.rear_image_file) {
      fd.append('rear_image', f.rear_image_file);
    } else if (f.rear_image_url === null && this.drawerMode() === 'edit') {
      fd.append('rear_image', '');
    }

    this.drawerSave.set('saving');
    const base = `${environment.service_url}/asset/asset_model`;

    const req$ =
      this.drawerMode() === 'create'
        ? this.http.post<AssetModel>(base, fd)
        : this.http.patch<AssetModel>(`${base}/${this.drawerEditId()}`, fd);

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
}
