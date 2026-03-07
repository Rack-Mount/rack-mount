import { SlicePipe } from '@angular/common';
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
import { TranslatePipe } from '@ngx-translate/core';
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
import {
  AssetService,
  ComponentTypeEnum,
  GenericComponent,
} from '../../../../core/api/v1';
import {
  COMPONENT_TYPE_LABELS,
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from '../../../../core/constants';
import { RoleService } from '../../../../core/services/role.service';
import {
  DestroyableState,
  PaginatedListState,
} from '../../../../core/types/list-state.types';
import { toggleSort } from '../../../../core/utils/sort.utils';
import { ComponentCreateDrawerComponent } from './component-create-drawer/component-create-drawer.component';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

@Component({
  selector: 'app-components-list',
  standalone: true,
  imports: [SlicePipe, TranslatePipe, ComponentCreateDrawerComponent],
  templateUrl: './components-list.component.html',
  styleUrl: './components-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComponentsListComponent {
  private readonly svc = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly role = inject(RoleService);

  protected readonly componentTypes = Object.entries(COMPONENT_TYPE_LABELS) as [
    ComponentTypeEnum,
    string,
  ][];

  // ── Filter params ─────────────────────────────────────────────────────────
  protected readonly search = signal('');
  protected readonly typeFilter = signal<ComponentTypeEnum | null>(null);
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
  protected readonly listState = signal<PaginatedListState<GenericComponent>>({
    status: 'loading',
  });

  protected readonly items = computed(() => {
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
  protected readonly drawerEditComponent = signal<GenericComponent | null>(
    null,
  );

  // ── Preview ───────────────────────────────────────────────────────────────
  protected readonly previewItem = signal<GenericComponent | null>(null);

  // ── Delete ────────────────────────────────────────────────────────────────
  protected readonly deleteId = signal<number | null>(null);
  protected readonly deleteSave = signal<DestroyableState>('idle');

  constructor() {
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
        typeFilter: this.typeFilter(),
        page: this.page(),
        ordering: this.ordering(),
      })),
    )
      .pipe(
        switchMap((p) =>
          concat(
            of<PaginatedListState<GenericComponent>>({ status: 'loading' }),
            this.svc
              .assetGenericComponentList({
                search: p.search || undefined,
                componentType: p.typeFilter ?? undefined,
                page: p.page,
                pageSize: PAGE_SIZE,
                ordering: p.ordering,
              })
              .pipe(
                map(
                  (r): PaginatedListState<GenericComponent> => ({
                    status: 'loaded',
                    results: r.results ?? [],
                    count: r.count ?? 0,
                  }),
                ),
                catchError(() =>
                  of<PaginatedListState<GenericComponent>>({ status: 'error' }),
                ),
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

  protected onTypeFilter(val: string): void {
    this.typeFilter.set(val ? (val as ComponentTypeEnum) : null);
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.typeFilter.set(null);
    this.page.set(1);
  }

  protected readonly hasFilters = computed(
    () => !!this.search() || this.typeFilter() !== null,
  );

  // ── Sorting ────────────────────────────────────────────────────────────────
  protected sort(field: string): void {
    this.ordering.set(toggleSort(this.ordering(), field));
    this.page.set(1);
  }

  // ── Drawer ────────────────────────────────────────────────────────────────
  protected openCreate(): void {
    this.drawerMode.set('create');
    this.drawerEditComponent.set(null);
    this.drawerOpen.set(true);
  }

  protected openEdit(c: GenericComponent): void {
    this.drawerMode.set('edit');
    this.drawerEditComponent.set(c);
    this.drawerOpen.set(true);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  protected onDrawerSaved(saved: GenericComponent): void {
    this.drawerOpen.set(false);
    if (this.drawerMode() === 'create') {
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
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  protected openPreview(c: GenericComponent): void {
    this.previewItem.set(c);
  }

  protected closePreview(): void {
    this.previewItem.set(null);
  }

  protected previewEdit(): void {
    const c = this.previewItem();
    if (!c) return;
    this.closePreview();
    this.openEdit(c);
  }

  protected imgW(url: string | null | undefined, w: number): string {
    if (!url) return '';
    return url.includes('?') ? `${url}&w=${w}` : `${url}?w=${w}`;
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
      .assetGenericComponentDestroy({ id })
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
