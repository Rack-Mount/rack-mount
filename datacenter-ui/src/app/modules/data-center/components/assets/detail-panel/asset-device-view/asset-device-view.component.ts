import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  catchError,
  map,
  Observable,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { environment } from '../../../../../../../environments/environment';
import {
  Asset,
  AssetService,
  AssetState,
  WarehouseItem,
} from '../../../../../core/api/v1';
import { LocationService, Room } from '../../../../../core/api/v1';

export interface AssetTransitionLog {
  readonly id: number;
  readonly from_state: number | null;
  readonly from_state_name: string | null;
  readonly to_state: number;
  readonly to_state_name: string;
  readonly from_room: number | null;
  readonly from_room_name: string | null;
  readonly to_room: number | null;
  readonly to_room_name: string | null;
  readonly user: number;
  readonly username: string;
  readonly notes: string;
  readonly timestamp: string;
}
import { MediaUrlService } from '../../../../../core/services/media-url.service';
import { BackendErrorService } from '../../../../../core/services/backend-error.service';
import { RoleService } from '../../../../../core/services/role.service';
import { ALLOWED_TRANSITIONS, formatDate, stateColor } from '../../assets-list/assets-list-utils';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; asset: Asset };

@Component({
  selector: 'app-asset-device-view',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './asset-device-view.component.html',
  styleUrl: './asset-device-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetDeviceViewComponent {
  readonly assetId = input.required<number>();

  private readonly assetService = inject(AssetService);
  private readonly locationService = inject(LocationService);
  private readonly mediaUrlService = inject(MediaUrlService);
  private readonly backendErr = inject(BackendErrorService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly role = inject(RoleService);

  protected readonly serviceUrl = environment.service_url;
  protected readonly stateColor = stateColor;
  protected readonly formatDate = formatDate;
  protected readonly today = new Date().toISOString().slice(0, 10);

  // ── Asset load ─────────────────────────────────────────────────────────────
  readonly loadState = toSignal(
    toObservable(this.assetId).pipe(
      switchMap((id) =>
        this.assetService.assetAssetRetrieve({ id }).pipe(
          map((asset): LoadState => ({ status: 'loaded', asset })),
          catchError((): Observable<LoadState> => of({ status: 'error' })),
          startWith<LoadState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as LoadState },
  );

  protected readonly asset = computed(() => {
    const s = this.loadState();
    return s.status === 'loaded' ? s.asset : null;
  });

  // ── Images ─────────────────────────────────────────────────────────────────
  private readonly frontImagePath = computed(() => {
    const a = this.asset();
    return a?.model.front_image ?? null;
  });

  private readonly rearImagePath = computed(() => {
    const a = this.asset();
    return a?.model.rear_image ?? null;
  });

  protected readonly frontImage = toSignal(
    toObservable(this.frontImagePath).pipe(
      switchMap((img) =>
        img ? this.mediaUrlService.resolveImageUrl(img, 960) : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly rearImage = toSignal(
    toObservable(this.rearImagePath).pipe(
      switchMap((img) =>
        img ? this.mediaUrlService.resolveImageUrl(img, 960) : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly typeIcon = computed(() => {
    const a = this.asset();
    if (!a) return '📦';
    const t = (a.model.type.name ?? '').toLowerCase();
    if (t.includes('server')) return '🖥';
    if (t.includes('switch')) return '🔀';
    if (t.includes('router')) return '🌐';
    if (t.includes('firewall')) return '🛡';
    if (t.includes('storage')) return '💾';
    if (t.includes('pdu')) return '⚡';
    if (t.includes('kvm')) return '🖱';
    if (t.includes('ups')) return '🔋';
    return '📦';
  });

  protected readonly warrantyExpired = computed(() => {
    const a = this.asset();
    if (!a) return false;
    return !!a.warranty_expiration && a.warranty_expiration < this.today;
  });

  protected readonly supportExpired = computed(() => {
    const a = this.asset();
    if (!a) return false;
    return !!a.support_expiration && a.support_expiration < this.today;
  });

  // ── Move form ──────────────────────────────────────────────────────────────
  protected readonly moveFormOpen = signal(false);
  protected readonly moveToStateId = signal<number | null>(null);
  protected readonly moveToRoomId = signal<number | null>(null);
  protected readonly moveNotes = signal('');
  protected readonly moveSaving = signal(false);
  protected readonly moveError = signal('');

  protected readonly availableStates = signal<AssetState[]>([]);
  protected readonly availableRooms = signal<Room[]>([]);

  /** States reachable from the current asset state, based on the backend state machine. */
  protected readonly allowedStates = computed(() => {
    const all = this.availableStates();
    const currentCode = (this.asset()?.state as any)?.code as string | null | undefined;
    if (!currentCode) return all;
    const allowed = ALLOWED_TRANSITIONS[currentCode];
    if (!allowed) return all;
    return all.filter((s) => {
      const code = (s as any).code as string | null | undefined;
      return !code || allowed.has(code);
    });
  });

  protected openMoveForm(): void {
    const a = this.asset();
    this.moveToStateId.set(a?.state.id ?? null);
    this.moveToRoomId.set(a?.room?.id ?? null);
    this.moveNotes.set('');
    this.moveSaving.set(false);
    this.moveError.set('');
    this.moveFormOpen.set(true);

    if (this.availableStates().length === 0) {
      this.assetService
        .assetAssetStateList({ pageSize: 100 })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((r) => this.availableStates.set(r.results ?? []));
    }
    if (this.availableRooms().length === 0) {
      this.locationService
        .locationRoomList({ pageSize: 1000, ordering: 'name' })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((r) => this.availableRooms.set(r.results ?? []));
    }
  }

  protected cancelMoveForm(): void {
    this.moveFormOpen.set(false);
  }

  protected submitMove(): void {
    const id = this.assetId();
    const to_state = this.moveToStateId();
    if (!to_state) return;

    this.moveSaving.set(true);
    this.moveError.set('');

    this.assetService
      .assetAssetMoveCreate({
        id,
        asset: { to_state, to_room: this.moveToRoomId(), notes: this.moveNotes() } as any,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.moveSaving.set(false);
          this.moveFormOpen.set(false);
          this.historyOpen.set(true);
          this.loadHistory();
          // Reload asset state
          toObservable(this.assetId)
            .pipe(
              switchMap((assetId) => this.assetService.assetAssetRetrieve({ id: assetId })),
              takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
        },
        error: (err: HttpErrorResponse) => {
          this.moveSaving.set(false);
          this.moveError.set(this.backendErr.parse(err));
        },
      });
  }

  // ── Compatible SFPs ────────────────────────────────────────────────────────
  protected readonly isSfpAsset = computed(() => {
    const a = this.asset();
    if (!a) return false;
    const t = (a.model.type.name ?? '').toLowerCase();
    return t.includes('switch') || t.includes('server');
  });

  protected readonly compatibleSfps = toSignal(
    toObservable(this.asset).pipe(
      switchMap((a) => {
        if (!a) return of([] as WarehouseItem[]);
        const t = (a.model.type.name ?? '').toLowerCase();
        if (!t.includes('switch') && !t.includes('server')) return of([] as WarehouseItem[]);
        return this.locationService
          .locationWarehouseItemList({ compatibleModel: a.model.id, pageSize: 100 })
          .pipe(
            map((res) => res.results ?? []),
            catchError(() => of([] as WarehouseItem[])),
          );
      }),
    ),
    { initialValue: [] as WarehouseItem[] },
  );

  // ── History ────────────────────────────────────────────────────────────────
  protected readonly historyOpen = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly historyEntries = signal<AssetTransitionLog[]>([]);

  protected toggleHistory(): void {
    const next = !this.historyOpen();
    this.historyOpen.set(next);
    if (next && this.historyEntries().length === 0) {
      this.loadHistory();
    }
  }

  private loadHistory(): void {
    this.historyLoading.set(true);
    (this.assetService
      .assetAssetHistoryRetrieve({ id: this.assetId() }) as unknown as Observable<AssetTransitionLog[]>)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entries) => {
          this.historyEntries.set(entries);
          this.historyLoading.set(false);
        },
        error: () => this.historyLoading.set(false),
      });
  }
}
