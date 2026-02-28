import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
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
import { AssetService, Vendor } from '../../../../core/api/v1';

const PAGE_SIZE = 50;

type SaveState = 'idle' | 'saving' | 'error';
type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; results: Vendor[]; count: number };

@Component({
  selector: 'app-vendors-list',
  standalone: true,
  imports: [],
  templateUrl: './vendors-list.component.html',
  styleUrl: './vendors-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorsListComponent {
  private readonly svc = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Search ────────────────────────────────────────────────────────────────
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly ordering = signal<string>('name');
  private readonly _searchInput = new Subject<string>();

  protected readonly sortField = computed(() => this.ordering().replace(/^-/, ''));
  protected readonly sortDir = computed(() =>
    this.ordering().startsWith('-') ? 'desc' : 'asc',
  );

  // ── List state ────────────────────────────────────────────────────────────
  protected readonly listState = signal<ListState>({ status: 'loading' });

  protected readonly vendors = computed(() => {
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

  // ── Inline create ─────────────────────────────────────────────────────────
  protected readonly createOpen = signal(false);
  protected readonly createName = signal('');
  protected readonly createSave = signal<SaveState>('idle');

  // ── Inline edit ───────────────────────────────────────────────────────────
  protected readonly editId = signal<number | null>(null);
  protected readonly editName = signal('');
  protected readonly editSave = signal<SaveState>('idle');

  // ── Delete confirmation ───────────────────────────────────────────────────
  protected readonly deleteId = signal<number | null>(null);
  protected readonly deleteSave = signal<SaveState>('idle');

  constructor() {
    // Debounce search → reset page
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

    // Drive list from search + page + ordering
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
            of<ListState>({ status: 'loading' }),
            this.svc
              .assetVendorList({
                search: p.search || undefined,
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

  // ── Search handler ────────────────────────────────────────────────────────
  protected onSearchInput(v: string): void {
    this._searchInput.next(v);
  }

  protected resetSearch(): void {
    this.search.set('');
    this.page.set(1);
  }

  // ── Sorting ─────────────────────────────────────────────────────────────
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

  // ── Create ────────────────────────────────────────────────────────────────
  protected openCreate(): void {
    this.createName.set('');
    this.createSave.set('idle');
    this.createOpen.set(true);
    this.editId.set(null);
  }

  protected cancelCreate(): void {
    this.createOpen.set(false);
  }

  protected submitCreate(): void {
    const name = this.createName().trim();
    if (!name) return;
    this.createSave.set('saving');
    this.svc
      .assetVendorCreate({ vendor: { name } as Vendor })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (v) => {
          this.createSave.set('idle');
          this.createOpen.set(false);
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: [v, ...s.results],
              count: s.count + 1,
            };
          });
        },
        error: () => this.createSave.set('error'),
      });
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  protected startEdit(v: Vendor): void {
    this.createOpen.set(false);
    this.editId.set(v.id);
    this.editName.set(v.name);
    this.editSave.set('idle');
  }

  protected cancelEdit(): void {
    this.editId.set(null);
  }

  protected submitEdit(): void {
    const id = this.editId();
    const name = this.editName().trim();
    if (!id || !name) return;
    this.editSave.set('saving');
    this.svc
      .assetVendorPartialUpdate({
        id,
        patchedVendor: { name } as Vendor,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.editSave.set('idle');
          this.editId.set(null);
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.map((r) =>
                r.id === updated.id ? updated : r,
              ),
            };
          });
        },
        error: () => this.editSave.set('error'),
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
      .assetVendorDestroy({ id })
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
        error: () => this.deleteSave.set('error'),
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
