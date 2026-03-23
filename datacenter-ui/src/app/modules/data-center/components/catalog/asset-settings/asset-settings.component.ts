import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  catchError,
  concat,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import { AssetService, AssetState, AssetType } from '../../../../core/api/v1';
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from '../../../../core/constants';
import { BackendErrorService } from '../../../../core/services/backend-error.service';
import { RoleService } from '../../../../core/services/role.service';
import {
  PaginatedListState,
  SaveState,
} from '../../../../core/types/list-state.types';
import { toggleSort } from '../../../../core/utils/sort.utils';
import { LocationsListComponent } from '../../infrastructure/locations-list/locations-list.component';
import { RackModelsListComponent } from '../../infrastructure/rack-models-list/rack-models-list.component';
import { ComponentsListComponent } from '../components-list/components-list.component';
import { VendorsListComponent } from '../vendors-list/vendors-list.component';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

@Component({
  selector: 'app-asset-settings',
  standalone: true,
  imports: [
    TranslatePipe,
    ComponentsListComponent,
    RackModelsListComponent,
    LocationsListComponent,
    VendorsListComponent,
  ],
  templateUrl: './asset-settings.component.html',
  styleUrl: './asset-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetSettingsComponent {
  private readonly svc = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly backendErr = inject(BackendErrorService);
  private readonly translate = inject(TranslateService);
  protected readonly role = inject(RoleService);

  protected readonly activeTab = signal<
    'states' | 'types' | 'rack-models' | 'locations' | 'vendors' | 'components'
  >(
    (() => {
      const r = inject(RoleService);
      if (r.isAdmin()) return 'states';
      if (r.canViewCatalog()) return 'vendors';
      return 'rack-models';
    })(),
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ASSET STATES
  // ══════════════════════════════════════════════════════════════════════════

  protected readonly stSearch = signal('');
  protected readonly stPage = signal(1);
  protected readonly stOrdering = signal('name');
  private readonly _stSearchInput = new Subject<string>();

  protected readonly stSortField = computed(() =>
    this.stOrdering().replace(/^-/, ''),
  );
  protected readonly stSortDir = computed(() =>
    this.stOrdering().startsWith('-') ? 'desc' : 'asc',
  );

  protected readonly stListState = signal<PaginatedListState<AssetState>>({
    status: 'loading',
  });
  protected readonly states = computed(() => {
    const s = this.stListState();
    return s.status === 'loaded' ? s.results : [];
  });
  protected readonly stTotalCount = computed(() => {
    const s = this.stListState();
    return s.status === 'loaded' ? s.count : 0;
  });
  protected readonly stTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.stTotalCount() / PAGE_SIZE)),
  );
  protected readonly stPageNumbers = computed(() => {
    const total = this.stTotalPages();
    const cur = this.stPage();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++)
      pages.push(i);
    return pages;
  });

  protected readonly stCreateOpen = signal(false);
  protected readonly stCreateName = signal('');
  protected readonly stCreateSave = signal<SaveState>('idle');
  protected readonly stCreateSaveMsg = signal('');

  protected readonly stEditId = signal<number | null>(null);
  protected readonly stEditName = signal('');
  protected readonly stEditSave = signal<SaveState>('idle');
  protected readonly stEditSaveMsg = signal('');

  protected readonly stDeleteId = signal<number | null>(null);
  protected readonly stDeleteSave = signal<SaveState>('idle');
  protected readonly stDeleteErrorMsg = signal('');

  // ══════════════════════════════════════════════════════════════════════════
  // ASSET TYPES
  // ══════════════════════════════════════════════════════════════════════════

  protected readonly tySearch = signal('');
  protected readonly tyPage = signal(1);
  protected readonly tyOrdering = signal('name');
  private readonly _tySearchInput = new Subject<string>();

  protected readonly tySortField = computed(() =>
    this.tyOrdering().replace(/^-/, ''),
  );
  protected readonly tySortDir = computed(() =>
    this.tyOrdering().startsWith('-') ? 'desc' : 'asc',
  );

  protected readonly tyListState = signal<PaginatedListState<AssetType>>({
    status: 'loading',
  });
  protected readonly types = computed(() => {
    const s = this.tyListState();
    return s.status === 'loaded' ? s.results : [];
  });
  protected readonly tyTotalCount = computed(() => {
    const s = this.tyListState();
    return s.status === 'loaded' ? s.count : 0;
  });
  protected readonly tyTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.tyTotalCount() / PAGE_SIZE)),
  );
  protected readonly tyPageNumbers = computed(() => {
    const total = this.tyTotalPages();
    const cur = this.tyPage();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++)
      pages.push(i);
    return pages;
  });

  protected readonly tyCreateOpen = signal(false);
  protected readonly tyCreateName = signal('');
  protected readonly tyCreateSave = signal<SaveState>('idle');
  protected readonly tyCreateSaveMsg = signal('');

  protected readonly tyEditId = signal<number | null>(null);
  protected readonly tyEditName = signal('');
  protected readonly tyEditSave = signal<SaveState>('idle');
  protected readonly tyEditSaveMsg = signal('');

  protected readonly tyDeleteId = signal<number | null>(null);
  protected readonly tyDeleteSave = signal<SaveState>('idle');
  protected readonly tyDeleteErrorMsg = signal('');

  // ── Constructor ───────────────────────────────────────────────────────────
  constructor() {
    this._stSearchInput
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((v) => {
        this.stSearch.set(v);
        this.stPage.set(1);
      });

    toObservable(
      computed(() => ({
        search: this.stSearch(),
        page: this.stPage(),
        ordering: this.stOrdering(),
      })),
    )
      .pipe(
        switchMap((p) =>
          concat(
            of<PaginatedListState<AssetState>>({ status: 'loading' }),
            this.svc
              .assetAssetStateList({
                search: p.search || undefined,
                page: p.page,
                pageSize: PAGE_SIZE,
                ordering: p.ordering,
              })
              .pipe(
                map(
                  (r): PaginatedListState<AssetState> => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() =>
                  of<PaginatedListState<AssetState>>({ status: 'error' }),
                ),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.stListState.set(s));

    this._tySearchInput
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((v) => {
        this.tySearch.set(v);
        this.tyPage.set(1);
      });

    toObservable(
      computed(() => ({
        search: this.tySearch(),
        page: this.tyPage(),
        ordering: this.tyOrdering(),
      })),
    )
      .pipe(
        switchMap((p) =>
          concat(
            of<PaginatedListState<AssetType>>({ status: 'loading' }),
            this.svc
              .assetAssetTypeList({
                search: p.search || undefined,
                page: p.page,
                pageSize: PAGE_SIZE,
                ordering: p.ordering,
              })
              .pipe(
                map(
                  (r): PaginatedListState<AssetType> => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() =>
                  of<PaginatedListState<AssetType>>({ status: 'error' }),
                ),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.tyListState.set(s));
  }

  // ── State helpers ─────────────────────────────────────────────────────────
  protected onStSearchInput(v: string): void {
    this._stSearchInput.next(v);
  }
  protected resetStSearch(): void {
    this.stSearch.set('');
    this.stPage.set(1);
  }
  protected stSort(field: string): void {
    this.stOrdering.set(toggleSort(this.stOrdering(), field));
    this.stPage.set(1);
  }
  protected stGoPage(p: number): void {
    this.stPage.set(p);
  }

  protected openStCreate(): void {
    this.stCreateName.set('');
    this.stCreateSave.set('idle');
    this.stCreateSaveMsg.set('');
    this.stCreateOpen.set(true);
    this.stEditId.set(null);
  }
  protected cancelStCreate(): void {
    this.stCreateOpen.set(false);
  }
  protected submitStCreate(): void {
    const name = this.stCreateName().trim();
    if (!name) return;
    this.stCreateSave.set('saving');
    this.svc
      .assetAssetStateCreate({ assetState: { name } as AssetState })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (st) => {
          this.stCreateSave.set('idle');
          this.stCreateOpen.set(false);
          this.stListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : { ...s, results: [st, ...s.results], count: s.count + 1 },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.stCreateSave.set('error');
          this.stCreateSaveMsg.set(this.backendErr.parse(err));
        },
      });
  }

  protected startStEdit(st: AssetState): void {
    this.stCreateOpen.set(false);
    this.stEditId.set(st.id);
    this.stEditName.set(st.name);
    this.stEditSave.set('idle');
    this.stEditSaveMsg.set('');
  }
  protected cancelStEdit(): void {
    this.stEditId.set(null);
  }
  protected submitStEdit(): void {
    const id = this.stEditId();
    const name = this.stEditName().trim();
    if (!id || !name) return;
    this.stEditSave.set('saving');
    this.svc
      .assetAssetStatePartialUpdate({ id, patchedAssetState: { name } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.stEditSave.set('idle');
          this.stEditId.set(null);
          this.stListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : {
                  ...s,
                  results: s.results.map((r) =>
                    r.id === updated.id ? updated : r,
                  ),
                },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.stEditSave.set('error');
          this.stEditSaveMsg.set(this.backendErr.parse(err));
        },
      });
  }

  protected confirmStDelete(id: number): void {
    this.stDeleteId.set(id);
    this.stDeleteSave.set('idle');
    this.stDeleteErrorMsg.set('');
  }
  protected cancelStDelete(): void {
    this.stDeleteId.set(null);
  }
  protected submitStDelete(): void {
    const id = this.stDeleteId();
    if (!id) return;
    this.stDeleteSave.set('saving');
    this.svc
      .assetAssetStateDestroy({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.stDeleteSave.set('idle');
          this.stDeleteId.set(null);
          this.stListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : {
                  ...s,
                  results: s.results.filter((r) => r.id !== id),
                  count: Math.max(0, s.count - 1),
                },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.stDeleteSave.set('error');
          this.stDeleteErrorMsg.set(
            err.status === 409
              ? this.translate.instant('asset_settings.in_use_state')
              : this.backendErr.parse(err),
          );
        },
      });
  }

  // ── Type helpers ─────────────────────────────────────────────────────────
  protected onTySearchInput(v: string): void {
    this._tySearchInput.next(v);
  }
  protected resetTySearch(): void {
    this.tySearch.set('');
    this.tyPage.set(1);
  }
  protected tySort(field: string): void {
    this.tyOrdering.set(toggleSort(this.tyOrdering(), field));
    this.tyPage.set(1);
  }
  protected tyGoPage(p: number): void {
    this.tyPage.set(p);
  }

  protected openTyCreate(): void {
    this.tyCreateName.set('');
    this.tyCreateSave.set('idle');
    this.tyCreateSaveMsg.set('');
    this.tyCreateOpen.set(true);
    this.tyEditId.set(null);
  }
  protected cancelTyCreate(): void {
    this.tyCreateOpen.set(false);
  }
  protected submitTyCreate(): void {
    const name = this.tyCreateName().trim();
    if (!name) return;
    this.tyCreateSave.set('saving');
    this.svc
      .assetAssetTypeCreate({ assetType: { name } as AssetType })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ty) => {
          this.tyCreateSave.set('idle');
          this.tyCreateOpen.set(false);
          this.tyListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : { ...s, results: [ty, ...s.results], count: s.count + 1 },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.tyCreateSave.set('error');
          this.tyCreateSaveMsg.set(this.backendErr.parse(err));
        },
      });
  }

  protected startTyEdit(ty: AssetType): void {
    this.tyCreateOpen.set(false);
    this.tyEditId.set(ty.id);
    this.tyEditName.set(ty.name);
    this.tyEditSave.set('idle');
    this.tyEditSaveMsg.set('');
  }
  protected cancelTyEdit(): void {
    this.tyEditId.set(null);
  }
  protected submitTyEdit(): void {
    const id = this.tyEditId();
    const name = this.tyEditName().trim();
    if (!id || !name) return;
    this.tyEditSave.set('saving');
    this.svc
      .assetAssetTypePartialUpdate({ id, patchedAssetType: { name } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.tyEditSave.set('idle');
          this.tyEditId.set(null);
          this.tyListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : {
                  ...s,
                  results: s.results.map((r) =>
                    r.id === updated.id ? updated : r,
                  ),
                },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.tyEditSave.set('error');
          this.tyEditSaveMsg.set(this.backendErr.parse(err));
        },
      });
  }

  protected confirmTyDelete(id: number): void {
    this.tyDeleteId.set(id);
    this.tyDeleteSave.set('idle');
    this.tyDeleteErrorMsg.set('');
  }
  protected cancelTyDelete(): void {
    this.tyDeleteId.set(null);
  }
  protected submitTyDelete(): void {
    const id = this.tyDeleteId();
    if (!id) return;
    this.tyDeleteSave.set('saving');
    this.svc
      .assetAssetTypeDestroy({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.tyDeleteSave.set('idle');
          this.tyDeleteId.set(null);
          this.tyListState.update((s) =>
            s.status !== 'loaded'
              ? s
              : {
                  ...s,
                  results: s.results.filter((r) => r.id !== id),
                  count: Math.max(0, s.count - 1),
                },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.tyDeleteSave.set('error');
          this.tyDeleteErrorMsg.set(
            err.status === 409
              ? this.translate.instant('asset_settings.in_use_type')
              : this.backendErr.parse(err),
          );
        },
      });
  }
}
