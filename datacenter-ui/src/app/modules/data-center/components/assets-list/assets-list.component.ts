import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
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
import {
  Asset,
  AssetService,
  AssetState,
  AssetType,
} from '../../../core/api/v1';
import { TabService } from '../../../core/services/tab.service';

type ListState =
  | { status: 'loading' }
  | { status: 'loaded'; results: Asset[]; count: number }
  | { status: 'error' };

type EditState = 'idle' | 'saving' | 'error';

const PAGE_SIZE = 25;

// Utility: map state name to a CSS colour token
function stateColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('attiv') || n.includes('activ') || n.includes('operativ'))
    return 'green';
  if (
    n.includes('manut') || n.includes('maint') ||
    n.includes('riserva') || n.includes('standby')
  )
    return 'yellow';
  if (
    n.includes('decomm') || n.includes('guasto') ||
    n.includes('fault') || n.includes('dismess')
  )
    return 'red';
  if (n.includes('install') || n.includes('transit')) return 'blue';
  return 'gray';
}

@Component({
  selector: 'app-assets-list',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './assets-list.component.html',
  styleUrl: './assets-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsListComponent {
  protected readonly assetService = inject(AssetService);
  protected readonly tabService = inject(TabService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Filter options ────────────────────────────────────────────────────────
  protected readonly availableStates = signal<AssetState[]>([]);
  protected readonly availableTypes = signal<AssetType[]>([]);

  // ── Filter params (single signal for reactivity) ──────────────────────────
  protected readonly params = signal({
    search: '',
    stateId: null as number | null,
    typeId: null as number | null,
    page: 1,
  });

  // Debounced search subject
  private readonly _searchInput = new Subject<string>();

  // ── List state ────────────────────────────────────────────────────────────
  protected readonly listState = signal<ListState>({ status: 'loading' });

  // ── Expanded row ──────────────────────────────────────────────────────────
  protected readonly expandedId = signal<number | null>(null);

  // ── State picker (same UX as rack) ────────────────────────────────────────
  protected readonly statePickerAssetId = signal<number | null>(null);
  protected readonly statePickerX = signal(0);
  protected readonly statePickerY = signal(0);
  protected readonly stateEditState = signal<EditState>('idle');

  // ── Computed helpers ──────────────────────────────────────────────────────
  protected readonly assets = computed<Asset[]>(() => {
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

  protected readonly startIndex = computed(
    () => (this.params().page - 1) * PAGE_SIZE + 1,
  );

  protected readonly endIndex = computed(() =>
    Math.min(this.params().page * PAGE_SIZE, this.totalCount()),
  );

  protected readonly skeletonRows = Array.from({ length: 10 }, (_, i) => i);

  // ── Utility exposed to template ───────────────────────────────────────────
  protected readonly stateColor = stateColor;
  protected readonly today = new Date().toISOString().slice(0, 10);

  constructor() {
    // ── Load filter options ──────────────────────────────────────────────────
    this.assetService
      .assetAssetStateList({ pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.availableStates.set(r.results ?? []));

    this.assetService
      .assetAssetTypeList({ pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.availableTypes.set(r.results ?? []));

    // ── Debounce search: update params, reset page ───────────────────────────
    this._searchInput
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((search) =>
        this.params.update((p) => ({ ...p, search, page: 1 })),
      );

    // ── Drive list from params observable ────────────────────────────────────
    toObservable(this.params)
      .pipe(
        switchMap((p) =>
          concat(
            of<ListState>({ status: 'loading' }),
            this.assetService
              .assetAssetList({
                search: p.search || undefined,
                state: p.stateId ?? undefined,
                modelType: p.typeId ?? undefined,
                page: p.page,
                pageSize: PAGE_SIZE,
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

  // ── Filter handlers ───────────────────────────────────────────────────────

  protected onSearchInput(value: string): void {
    this._searchInput.next(value);
  }

  protected onStateFilter(id: string): void {
    this.params.update((p) => ({
      ...p,
      stateId: id ? +id : null,
      page: 1,
    }));
  }

  protected onTypeFilter(id: string): void {
    this.params.update((p) => ({
      ...p,
      typeId: id ? +id : null,
      page: 1,
    }));
  }

  protected resetFilters(): void {
    this.params.set({ search: '', stateId: null, typeId: null, page: 1 });
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.params.update((p) => ({ ...p, page }));
  }

  // ── Row expand ────────────────────────────────────────────────────────────

  protected toggleExpand(id: number): void {
    this.expandedId.update((cur) => (cur === id ? null : id));
    this.statePickerAssetId.set(null);
  }

  // ── State picker ──────────────────────────────────────────────────────────

  protected openStatePicker(
    assetId: number,
    event: MouseEvent,
  ): void {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pickerW = 200;
    const pickerH = Math.min(this.availableStates().length * 36 + 8, 280);
    const idealX = rect.right + 6;
    const x =
      idealX + pickerW > window.innerWidth - 4
        ? rect.left - pickerW - 4
        : idealX;
    const idealY = rect.top - 4;
    const y = Math.max(4, Math.min(idealY, window.innerHeight - pickerH - 4));
    this.statePickerX.set(x);
    this.statePickerY.set(y);
    this.statePickerAssetId.set(assetId);
    this.stateEditState.set('idle');
  }

  protected closeStatePicker(): void {
    this.statePickerAssetId.set(null);
  }

  protected pickState(stateId: number): void {
    const assetId = this.statePickerAssetId();
    if (!assetId) return;
    this.stateEditState.set('saving');
    this.assetService
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .assetAssetPartialUpdate({ id: assetId, patchedAsset: { state_id: stateId } as any })
      .subscribe({
        next: (updated) => {
          this.stateEditState.set('idle');
          this.closeStatePicker();
          // Update the asset in the current list without re-fetching
          this.listState.update((s) => {
            if (s.status !== 'loaded') return s;
            return {
              ...s,
              results: s.results.map((a) =>
                a.id === assetId ? { ...a, state: updated.state, state_id: updated.state_id } : a,
              ),
            };
          });
        },
        error: () => this.stateEditState.set('error'),
      });
  }

  // ── Navigate to rack ──────────────────────────────────────────────────────

  protected openRack(rackName: string, event: MouseEvent): void {
    event.stopPropagation();
    this.tabService.openRack(rackName);
  }

  // ── Format helpers ────────────────────────────────────────────────────────

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  }

  protected relativeDate(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return 'oggi';
    if (days === 1) return 'ieri';
    if (days < 30) return `${days}g fa`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}m fa`;
    return `${Math.floor(months / 12)}a fa`;
  }
}
