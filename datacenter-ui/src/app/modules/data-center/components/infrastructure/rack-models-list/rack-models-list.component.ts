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
import { AssetService, RackType } from '../../../../core/api/v1';
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from '../../../../core/constants';
import { BackendErrorService } from '../../../../core/services/backend-error.service';
import { RoleService } from '../../../../core/services/role.service';
import { PaginatedListState } from '../../../../core/types/list-state.types';
import { toggleSort } from '../../../../core/utils/sort.utils';
import { RackModelCreateDrawerComponent } from '../racks-list/rack-model-create-drawer/rack-model-create-drawer.component';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

@Component({
  selector: 'app-rack-models-list',
  standalone: true,
  imports: [TranslatePipe, RackModelCreateDrawerComponent],
  templateUrl: './rack-models-list.component.html',
  styleUrl: './rack-models-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackModelsListComponent {
  private readonly svc = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly backendErr = inject(BackendErrorService);
  private readonly translate = inject(TranslateService);
  protected readonly role = inject(RoleService);

  // ── List state ─────────────────────────────────────────────────────────────
  protected readonly listState = signal<PaginatedListState<RackType>>({
    status: 'loading',
  });
  protected readonly page = signal(1);
  protected readonly ordering = signal('model');
  protected readonly search = signal('');
  private readonly _searchInput = new Subject<string>();

  protected readonly rackModels = computed(() => {
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
  protected readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const cur = this.page();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) {
      pages.push(i);
    }
    return pages;
  });

  protected readonly sortField = computed(() =>
    this.ordering().replace(/^-/, ''),
  );
  protected readonly sortDir = computed(() =>
    this.ordering().startsWith('-') ? 'desc' : 'asc',
  );

  // ── Drawer state ──────────────────────────────────────────────────────────
  protected readonly drawerMode = signal<'create' | 'edit' | null>(null);
  protected readonly editingType = signal<RackType | null>(null);

  // ── Delete state ──────────────────────────────────────────────────────────
  protected readonly deleteId = signal<number | null>(null);
  protected readonly deleteSave = signal<'idle' | 'saving' | 'error'>('idle');
  protected readonly deleteErrorMsg = signal('');

  constructor() {
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

    toObservable(
      computed(() => ({
        search: this.search(),
        page: this.page(),
        ordering: this.ordering(),
      })),
    )
      .pipe(
        switchMap((p) =>
          concat(
            of<PaginatedListState<RackType>>({ status: 'loading' }),
            this.svc
              .assetRackTypeList({
                search: p.search || undefined,
                page: p.page,
                pageSize: PAGE_SIZE,
                ordering: p.ordering,
              })
              .pipe(
                map(
                  (r): PaginatedListState<RackType> => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() =>
                  of<PaginatedListState<RackType>>({ status: 'error' }),
                ),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.listState.set(s));
  }

  // ── Search / sort / page ──────────────────────────────────────────────────
  protected onSearchInput(v: string): void {
    this._searchInput.next(v);
  }
  protected resetSearch(): void {
    this.search.set('');
    this.page.set(1);
  }
  protected sort(field: string): void {
    this.ordering.set(toggleSort(this.ordering(), field));
    this.page.set(1);
  }
  protected goPage(p: number): void {
    this.page.set(p);
  }

  // ── Create / Edit ─────────────────────────────────────────────────────────
  protected openCreate(): void {
    this.editingType.set(null);
    this.drawerMode.set('create');
  }
  protected openEdit(rt: RackType): void {
    this.editingType.set(rt);
    this.drawerMode.set('edit');
  }
  protected closeDrawer(): void {
    this.drawerMode.set(null);
    this.editingType.set(null);
  }
  protected onDrawerSaved(rt: RackType): void {
    this.drawerMode.set(null);
    this.editingType.set(null);
    this.listState.update((s) => {
      if (s.status !== 'loaded') return s;
      const exists = s.results.some((r) => r.id === rt.id);
      const results = exists
        ? s.results.map((r) => (r.id === rt.id ? rt : r))
        : [rt, ...s.results];
      return { ...s, results, count: exists ? s.count : s.count + 1 };
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  protected confirmDelete(id: number): void {
    this.deleteId.set(id);
    this.deleteSave.set('idle');
    this.deleteErrorMsg.set('');
  }
  protected cancelDelete(): void {
    this.deleteId.set(null);
  }
  protected submitDelete(): void {
    const id = this.deleteId();
    if (id == null) return;
    this.deleteSave.set('saving');
    this.svc
      .assetRackTypeDestroy({ id })
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
          this.deleteSave.set('error');
          this.deleteErrorMsg.set(
            err.status === 409
              ? this.translate.instant('rack_models.in_use')
              : this.backendErr.parse(err),
          );
        },
      });
  }
}
