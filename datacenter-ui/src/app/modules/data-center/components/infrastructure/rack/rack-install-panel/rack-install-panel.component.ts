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
import { TranslatePipe } from '@ngx-translate/core';
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
import { Asset, AssetService } from '../../../../../core/api/v1';

type InstallAssetsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; results: Asset[] }
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

  /** Emitted when the user closes the panel without installing. */
  readonly closed = output<void>();
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

  readonly installableAssets = computed<Asset[]>(() => {
    const s = this._assetsState();
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
  }

  ngOnInit(): void {
    // Panel just became visible – load all assets with no filter
    this._immediateSearch$.next('');
  }

  // ── Public actions ─────────────────────────────────────────────────────────

  protected onSearch(value: string): void {
    this._search.set(value);
    this._debouncedSearch$.next(value);
  }

  protected selectAndInstall(assetId: number): void {
    this._selectedId.set(assetId);
    this._confirmInstall();
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
        } as any,
      })
      .subscribe({
        next: () => {
          this._saving.set(false);
          this.installed.emit();
        },
        error: () => {
          this._saving.set(false);
          this._error.set(
            "Installazione non riuscita: verificare che la posizione sia libera e l'apparato non sia già installato.",
          );
        },
      });
  }

  protected close(): void {
    this.closed.emit();
  }
}
