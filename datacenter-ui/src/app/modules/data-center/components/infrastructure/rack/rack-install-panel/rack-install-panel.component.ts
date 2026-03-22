import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  Subject,
  catchError,
  concat,
  debounceTime,
  map,
  merge,
  of,
  switchMap,
} from 'rxjs';
import {
  Asset,
  AssetService,
  GenericComponent,
} from '../../../../../core/api/v1';
import { BackendErrorService } from '../../../../../core/services/backend-error.service';

type InstallAssetsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; results: Asset[] }
  | { status: 'error' };

type InstallComponentsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; results: GenericComponent[] }
  | { status: 'error' };

/**
 * Floating overlay panel that allows the user to search for an asset and
 * install it in the chosen rack-unit slot.
 *
 * The parent mounts this component inside an @if block only while the panel
 * should be visible, so OnInit is a safe place to trigger the initial load.
 */
@Component({
  selector: 'app-rack-install-panel',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './rack-install-panel.component.html',
  styleUrl: './rack-install-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RackInstallPanelComponent implements OnInit {
  /** U-position of the target slot (1-based from bottom, always ≥ 1 while panel is shown). */
  readonly position = input.required<number>();
  /** Viewport X anchor for the panel. */
  readonly anchorX = input<number>(0);
  /** Viewport Y anchor for the panel. */
  readonly anchorY = input<number>(0);
  /** Rack DB id – required to POST the rack-unit record. */
  readonly rackId = input.required<number>();
  /** Number of consecutive free U-slots at the target position (0 = unknown). */
  readonly availableU = input<number>(0);
  /** Which face is currently shown in the rack view (true = front, false = rear). */
  readonly face = input<boolean>(true);

  /** Emitted when the user closes the panel without installing. */
  readonly closed = output<void>();

  private readonly translate = inject(TranslateService);
  private readonly backendErrorSvc = inject(BackendErrorService);
  /** Emitted after a successful install; parent should refresh the rack. */
  readonly installed = output<void>();

  private readonly assetService = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Internal state ─────────────────────────────────────────────────────────

  readonly _search = signal('');
  readonly _selectedId = signal<number | null>(null);
  readonly _saving = signal(false);
  readonly _error = signal<string | null>(null);
  readonly _assetsState = signal<InstallAssetsState>({ status: 'idle' });

  /** Active tab: 'asset' or 'component'. */
  readonly _tab = signal<'asset' | 'component'>('asset');

  /** True = install on front face; false = rear face. Initialised from [face] input in ngOnInit. */
  readonly _front = signal(true);

  readonly _componentsState = signal<InstallComponentsState>({
    status: 'idle',
  });

  /** Search string for the generic-component tab. */
  readonly _componentSearch = signal('');

  readonly installableAssets = computed<Asset[]>(() => {
    const s = this._assetsState();
    return s.status === 'loaded' ? s.results : [];
  });

  readonly installableComponents = computed<GenericComponent[]>(() => {
    const s = this._componentsState();
    return s.status === 'loaded' ? s.results : [];
  });

  /** Returns true when the asset is too large for the available space. */
  protected isTooLarge(asset: Asset): boolean {
    const avail = this.availableU();
    if (!avail) return false; // unknown – allow
    return (asset.model.rack_units ?? 1) > avail;
  }

  // Two rx subjects: one debounced (typed search), one immediate (panel open)
  private readonly _immediateSearch$ = new Subject<string>();
  private readonly _debouncedSearch$ = new Subject<string>();

  private readonly _immediateComponentSearch$ = new Subject<string>();
  private readonly _debouncedComponentSearch$ = new Subject<string>();

  constructor() {
    merge(
      this._immediateSearch$,
      this._debouncedSearch$.pipe(debounceTime(250)),
    )
      .pipe(
        switchMap((search) =>
          concat(
            of<InstallAssetsState>({ status: 'loading' }),
            this.assetService
              .assetAssetList({ search, pageSize: 5, notInRack: true })
              .pipe(
                map(
                  (r): InstallAssetsState => ({
                    status: 'loaded',
                    results: r.results,
                  }),
                ),
                catchError(() => of<InstallAssetsState>({ status: 'error' })),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this._assetsState.set(state));

    merge(
      this._immediateComponentSearch$,
      this._debouncedComponentSearch$.pipe(debounceTime(250)),
    )
      .pipe(
        switchMap((search) =>
          concat(
            of<InstallComponentsState>({ status: 'loading' }),
            this.assetService
              .assetGenericComponentList({ search, pageSize: 50 })
              .pipe(
                map(
                  (r): InstallComponentsState => ({
                    status: 'loaded',
                    results: r.results,
                  }),
                ),
                catchError(() =>
                  of<InstallComponentsState>({ status: 'error' }),
                ),
              ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this._componentsState.set(state));
  }

  ngOnInit(): void {
    // Initialise face from parent (which face the rack is currently showing)
    this._front.set(this.face());
    // Panel just became visible – load all assets with no filter
    this._immediateSearch$.next('');
  }

  // ── Tab switching ──────────────────────────────────────────────────────────

  protected switchTab(tab: 'asset' | 'component'): void {
    this._tab.set(tab);
    this._selectedId.set(null);
    this._error.set(null);
    if (tab === 'component' && this._componentsState().status === 'idle') {
      this._immediateComponentSearch$.next('');
    }
  }

  // ── Public actions ─────────────────────────────────────────────────────────

  protected onSearch(value: string): void {
    this._search.set(value);
    this._debouncedSearch$.next(value);
  }

  protected onComponentSearch(value: string): void {
    this._componentSearch.set(value);
    this._debouncedComponentSearch$.next(value);
  }

  protected selectAndInstall(assetId: number): void {
    this._selectedId.set(assetId);
    this._confirmInstall();
  }

  protected selectAndInstallComponent(componentId: number): void {
    this._selectedId.set(componentId);
    this._confirmInstallComponent();
  }

  private _confirmInstall(): void {
    const assetId = this._selectedId();
    if (!assetId) return;
    this._saving.set(true);
    this._error.set(null);
    this.assetService
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .assetRackUnitCreate({
        rackUnit: {
          rack: this.rackId(),
          device: assetId,
          position: this.position(),
          rack_installation_front: this._front(),
        } as any,
      })
      .subscribe({
        next: () => {
          this._saving.set(false);
          this.installed.emit();
        },
        error: (err: HttpErrorResponse) => {
          this._saving.set(false);
          this._error.set(this.backendErrorSvc.parse(err));
        },
      });
  }

  private _confirmInstallComponent(): void {
    const componentId = this._selectedId();
    if (!componentId) return;
    this._saving.set(true);
    this._error.set(null);
    this.assetService
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .assetRackUnitCreate({
        rackUnit: {
          rack: this.rackId(),
          generic_component: componentId,
          position: this.position(),
          rack_installation_front: this._front(),
        } as any,
      })
      .subscribe({
        next: () => {
          this._saving.set(false);
          this.installed.emit();
        },
        error: (err: HttpErrorResponse) => {
          this._saving.set(false);
          this._error.set(this.backendErrorSvc.parse(err));
        },
      });
  }

  protected close(): void {
    this.closed.emit();
  }
}
