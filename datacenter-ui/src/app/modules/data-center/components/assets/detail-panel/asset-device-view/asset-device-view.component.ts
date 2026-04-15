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
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, map, Observable, of, startWith, switchMap } from 'rxjs';
import { environment } from '../../../../../../../environments/environment';
import {
  Asset,
  AssetNetworkInterface,
  AssetService,
  AssetState,
  LocationService,
  MediaTypeEnum,
  PortCountEnum,
  Room,
  SideEnum,
  SpeedEnum,
  WarehouseItem,
} from '../../../../../core/api/v1';
import {
  AssetRequest,
  AssetRequestType,
  isRequestTerminal,
  requestStatusColor,
} from '../../../../../core/models/asset-request.model';
import {
  AssetNetworkInterfaceService,
  AssetNetworkInterfaceWrite,
} from '../../../../../core/services/asset-network-interface.service';
import { AssetRequestService } from '../../../../../core/services/asset-request.service';
import { BackendErrorService } from '../../../../../core/services/backend-error.service';
import { MediaUrlService } from '../../../../../core/services/media-url.service';
import { RoleService } from '../../../../../core/services/role.service';
import {
  ALLOWED_TRANSITIONS,
  formatDate,
  stateColor,
} from '../../assets-list/assets-list-utils';

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
  private readonly requestSvc = inject(AssetRequestService);
  private readonly nicSvc = inject(AssetNetworkInterfaceService);

  protected readonly serviceUrl = environment.service_url;
  protected readonly stateColor = stateColor;
  protected readonly formatDate = formatDate;
  protected readonly requestStatusColor = requestStatusColor;
  protected readonly isRequestTerminal = isRequestTerminal;
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
    const currentCode = (this.asset()?.state as any)?.code as
      | string
      | null
      | undefined;
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
        asset: {
          to_state,
          to_room: this.moveToRoomId(),
          notes: this.moveNotes(),
        } as any,
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
              switchMap((assetId) =>
                this.assetService.assetAssetRetrieve({ id: assetId }),
              ),
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
        if (!t.includes('switch') && !t.includes('server'))
          return of([] as WarehouseItem[]);
        return this.locationService
          .locationWarehouseItemList({
            compatibleModel: a.model.id,
            pageSize: 100,
          })
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
    (
      this.assetService.assetAssetHistoryRetrieve({
        id: this.assetId(),
      }) as unknown as Observable<AssetTransitionLog[]>
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entries) => {
          this.historyEntries.set(entries);
          this.historyLoading.set(false);
        },
        error: () => this.historyLoading.set(false),
      });
  }

  // ── Asset Requests ─────────────────────────────────────────────────────────
  protected readonly requestsOpen = signal(false);
  protected readonly requestsLoading = signal(false);
  protected readonly assetRequests = signal<AssetRequest[]>([]);

  protected toggleRequests(): void {
    const next = !this.requestsOpen();
    this.requestsOpen.set(next);
    if (next && this.assetRequests().length === 0) {
      this.loadAssetRequests();
    }
  }

  private loadAssetRequests(): void {
    this.requestsLoading.set(true);
    this.requestSvc
      .list({ asset: this.assetId(), pageSize: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.assetRequests.set(res.results);
          this.requestsLoading.set(false);
        },
        error: () => this.requestsLoading.set(false),
      });
  }

  // ── New request form ───────────────────────────────────────────────────────
  protected readonly newRequestOpen = signal(false);
  protected readonly newReqType = signal<AssetRequestType>('relocation');
  protected readonly newReqToStateId = signal<number | null>(null);
  protected readonly newReqToRoomId = signal<number | null>(null);
  protected readonly newReqNotes = signal('');
  protected readonly newReqSaving = signal(false);
  protected readonly newReqError = signal('');

  protected openNewRequest(): void {
    const a = this.asset();
    this.newReqToStateId.set(null);
    this.newReqToRoomId.set(a?.room?.id ?? null);
    this.newReqNotes.set('');
    this.newReqError.set('');
    this.newReqSaving.set(false);
    this.newRequestOpen.set(true);

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

  protected cancelNewRequest(): void {
    this.newRequestOpen.set(false);
  }

  protected submitNewRequest(): void {
    const toState = this.newReqToStateId();
    if (!toState) return;

    this.newReqSaving.set(true);
    this.newReqError.set('');

    this.requestSvc
      .create({
        asset: this.assetId(),
        request_type: this.newReqType(),
        to_state: toState,
        to_room: this.newReqToRoomId(),
        notes: this.newReqNotes(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.newReqSaving.set(false);
          this.newRequestOpen.set(false);
          this.requestsOpen.set(true);
          this.assetRequests.update((list) => [created, ...list]);
        },
        error: (err: HttpErrorResponse) => {
          this.newReqSaving.set(false);
          this.newReqError.set(this.backendErr.parse(err));
        },
      });
  }

  // ── Network Interfaces ─────────────────────────────────────────────────────

  /** True only when the asset type is 'server'. */
  protected readonly isServer = computed(() => {
    const a = this.asset();
    if (!a) return false;
    return (a.model.type.name ?? '').toLowerCase().includes('server');
  });

  protected readonly nicList = signal<AssetNetworkInterface[]>([]);
  protected readonly nicLoading = signal(false);
  protected readonly nicSectionOpen = signal(false);

  /** Inline add/edit form state */
  protected readonly nicFormOpen = signal(false);
  protected readonly nicEditId = signal<number | null>(null);
  protected readonly nicFormName = signal('');
  protected readonly nicFormMediaType = signal<MediaTypeEnum>(
    MediaTypeEnum.Copper,
  );
  protected readonly nicFormPortCount = signal<PortCountEnum>(
    PortCountEnum.NUMBER_1,
  );
  protected readonly nicFormSpeed = signal<SpeedEnum>(SpeedEnum._1G);
  protected readonly nicFormSlot = signal('');
  protected readonly nicFormNotes = signal('');
  protected readonly nicSaving = signal(false);
  protected readonly nicError = signal('');
  protected readonly nicDeleteId = signal<number | null>(null);

  /**
   * ID of the NIC currently being positioned on the panel canvas.
   * When non-null the panel enters crosshair/place mode.
   */
  protected readonly nicPlacingId = signal<number | null>(null);

  /** Live rectangle being drawn while the user drags on a panel */
  protected readonly nicDrawRect = signal<{
    side: 'front' | 'rear';
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  /** ID of the NIC currently being drag-moved or resized on the canvas */
  protected readonly nicDraggingId = signal<number | null>(null);

  /**
   * Unified interaction state for draw / move / resize.
   * mode='draw'  : startX/Y = rect origin, nicId = null
   * mode='move'  : startX/Y = mousedown offset within rect, w0/h0 = preserved size
   * mode='resize': startX/Y = fixed top-left corner of rect
   */
  private nicInteractState: {
    mode: 'draw' | 'move' | 'resize';
    side: 'front' | 'rear';
    el: HTMLElement;
    startX: number;
    startY: number;
    nicId: number | null;
    w0: number;
    h0: number;
  } | null = null;

  /** NICs that have been placed on the front panel */
  protected readonly nicsFront = computed(() =>
    this.nicList().filter(
      (n) => n.pos_x != null && n.width != null && n.side === SideEnum.Front,
    ),
  );
  /** NICs that have been placed on the rear panel */
  protected readonly nicsRear = computed(() =>
    this.nicList().filter(
      (n) =>
        n.pos_x != null &&
        n.width != null &&
        (n.side === SideEnum.Rear || !n.side),
    ),
  );

  protected readonly nicMediaOptions: {
    value: MediaTypeEnum;
    label: string;
  }[] = [
    { value: MediaTypeEnum.Copper, label: 'Copper (RJ45)' },
    { value: MediaTypeEnum.Fiber, label: 'Fiber (SFP/DAC)' },
  ];
  protected readonly nicPortCountOptions: {
    value: PortCountEnum;
    label: string;
  }[] = [
    { value: PortCountEnum.NUMBER_1, label: '1× (Single)' },
    { value: PortCountEnum.NUMBER_2, label: '2× (Dual)' },
    { value: PortCountEnum.NUMBER_4, label: '4× (Quad)' },
  ];
  protected readonly nicSpeedOptions: { value: SpeedEnum; label: string }[] = [
    { value: SpeedEnum._100M, label: '100 Mbps' },
    { value: SpeedEnum._1G, label: '1 GbE' },
    { value: SpeedEnum._10G, label: '10 GbE' },
    { value: SpeedEnum._25G, label: '25 GbE' },
    { value: SpeedEnum._40G, label: '40 GbE' },
    { value: SpeedEnum._100G, label: '100 GbE' },
    { value: SpeedEnum._200G, label: '200 GbE' },
    { value: SpeedEnum._400G, label: '400 GbE' },
  ];

  /** Returns an index array [0…n-1] for driving @for port loops in the template */
  protected portRange(count: number | null | undefined): number[] {
    return Array.from({ length: count ?? 1 }, (_, i) => i);
  }

  protected toggleNicSection(): void {
    const next = !this.nicSectionOpen();
    this.nicSectionOpen.set(next);
    if (next && this.nicList().length === 0) {
      this.loadNics();
    }
  }

  private loadNics(): void {
    this.nicLoading.set(true);
    this.nicSvc
      .list(this.assetId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.nicList.set(res.results ?? []);
          this.nicLoading.set(false);
        },
        error: () => this.nicLoading.set(false),
      });
  }

  protected openNicForm(nic?: AssetNetworkInterface): void {
    if (nic) {
      this.nicEditId.set(nic.id);
      this.nicFormName.set(nic.name);
      this.nicFormMediaType.set(nic.media_type ?? MediaTypeEnum.Copper);
      this.nicFormPortCount.set(nic.port_count ?? PortCountEnum.NUMBER_1);
      this.nicFormSpeed.set(nic.speed ?? SpeedEnum._1G);
      this.nicFormSlot.set(nic.slot ?? '');
      this.nicFormNotes.set(nic.notes ?? '');
    } else {
      this.nicEditId.set(null);
      this.nicFormName.set('');
      this.nicFormMediaType.set(MediaTypeEnum.Copper);
      this.nicFormPortCount.set(PortCountEnum.NUMBER_1);
      this.nicFormSpeed.set(SpeedEnum._1G);
      this.nicFormSlot.set('');
      this.nicFormNotes.set('');
    }
    this.nicError.set('');
    this.nicFormOpen.set(true);
  }

  protected cancelNicForm(): void {
    this.nicFormOpen.set(false);
    this.nicEditId.set(null);
  }

  protected submitNicForm(): void {
    const name = this.nicFormName().trim();
    if (!name) {
      this.nicError.set('Name is required');
      return;
    }
    this.nicSaving.set(true);
    this.nicError.set('');

    const body: AssetNetworkInterfaceWrite = {
      asset: this.assetId(),
      name,
      media_type: this.nicFormMediaType(),
      port_count: this.nicFormPortCount(),
      speed: this.nicFormSpeed(),
      slot: this.nicFormSlot(),
      notes: this.nicFormNotes(),
    };

    const editId = this.nicEditId();
    const req = editId
      ? this.nicSvc.update(editId, body)
      : this.nicSvc.create(body);

    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.nicSaving.set(false);
        this.nicFormOpen.set(false);
        this.nicEditId.set(null);
        if (editId) {
          this.nicList.update((list) =>
            list.map((n) => (n.id === editId ? saved : n)),
          );
        } else {
          this.nicList.update((list) => [...list, saved]);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.nicSaving.set(false);
        this.nicError.set(this.backendErr.parse(err));
      },
    });
  }

  protected deleteNic(id: number): void {
    this.nicDeleteId.set(id);
    this.nicSvc
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.nicDeleteId.set(null);
          this.nicList.update((list) => list.filter((n) => n.id !== id));
        },
        error: () => this.nicDeleteId.set(null),
      });
  }

  // ── NIC positioning on panel ───────────────────────────────────────────────

  protected startPlacingNic(nicId: number): void {
    this.nicPlacingId.set(nicId);
    this.nicDrawRect.set(null);
    document
      .querySelector('.panels-row')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  protected cancelPlacingNic(): void {
    this.nicPlacingId.set(null);
    this.nicInteractState = null;
    this.nicDraggingId.set(null);
    this.nicDrawRect.set(null);
  }

  // ── Panel interaction: draw / move / resize ────────────────────────────────

  /** Draw a new rect (only active in placing mode). */
  protected onPanelMouseDown(event: MouseEvent, side: 'front' | 'rear'): void {
    if (!this.nicPlacingId()) return;
    event.preventDefault();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const startX = ((event.clientX - rect.left) / rect.width) * 100;
    const startY = ((event.clientY - rect.top) / rect.height) * 100;
    this.nicInteractState = {
      mode: 'draw',
      side,
      startX,
      startY,
      el,
      nicId: null,
      w0: 0,
      h0: 0,
    };
    this.nicDrawRect.set({
      side,
      left: startX,
      top: startY,
      width: 0,
      height: 0,
    });
  }

  /** Start moving an already-placed NIC by dragging its body. */
  protected onNicMouseDown(
    event: MouseEvent,
    nic: AssetNetworkInterface,
    side: 'front' | 'rear',
  ): void {
    if (!this.role.canEditAssets() || this.nicPlacingId()) return;
    event.preventDefault();
    event.stopPropagation();
    const el = (event.currentTarget as HTMLElement).closest(
      '.panel-img-wrap',
    ) as HTMLElement;
    const rect = el.getBoundingClientRect();
    const curX = ((event.clientX - rect.left) / rect.width) * 100;
    const curY = ((event.clientY - rect.top) / rect.height) * 100;
    const w0 = nic.width ?? 0;
    const h0 = nic.height ?? 0;
    this.nicInteractState = {
      mode: 'move',
      side,
      el,
      startX: curX - (nic.pos_x ?? 0),
      startY: curY - (nic.pos_y ?? 0),
      nicId: nic.id,
      w0,
      h0,
    };
    this.nicDraggingId.set(nic.id);
    this.nicDrawRect.set({
      side,
      left: nic.pos_x ?? 0,
      top: nic.pos_y ?? 0,
      width: w0,
      height: h0,
    });
    this.addGlobalMouseUp();
  }

  /** Start resizing a placed NIC by dragging its bottom-right handle. */
  protected onResizeMouseDown(
    event: MouseEvent,
    nic: AssetNetworkInterface,
    side: 'front' | 'rear',
  ): void {
    if (!this.role.canEditAssets() || this.nicPlacingId()) return;
    event.preventDefault();
    event.stopPropagation();
    const el = (event.currentTarget as HTMLElement).closest(
      '.panel-img-wrap',
    ) as HTMLElement;
    this.nicInteractState = {
      mode: 'resize',
      side,
      el,
      startX: nic.pos_x ?? 0,
      startY: nic.pos_y ?? 0,
      nicId: nic.id,
      w0: 0,
      h0: 0,
    };
    this.nicDraggingId.set(nic.id);
    this.nicDrawRect.set({
      side,
      left: nic.pos_x ?? 0,
      top: nic.pos_y ?? 0,
      width: nic.width ?? 0,
      height: nic.height ?? 0,
    });
    this.addGlobalMouseUp();
  }

  /**
   * Registers a one-shot document-level mouseup listener so that releasing
   * outside the panel frame always ends the drag/resize cleanly.
   */
  private addGlobalMouseUp(): void {
    const handler = (e: MouseEvent): void => {
      document.removeEventListener('mouseup', handler);
      this.onPanelMouseUp(e);
    };
    document.addEventListener('mouseup', handler);
  }

  protected onPanelMouseMove(event: MouseEvent): void {
    if (!this.nicInteractState) return;
    const { mode, startX, startY, el, side, w0, h0 } = this.nicInteractState;
    const rect = el.getBoundingClientRect();
    const curX = Math.max(
      0,
      Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
    );
    const curY = Math.max(
      0,
      Math.min(100, ((event.clientY - rect.top) / rect.height) * 100),
    );

    if (mode === 'draw') {
      this.nicDrawRect.set({
        side,
        left: Math.min(startX, curX),
        top: Math.min(startY, curY),
        width: Math.abs(curX - startX),
        height: Math.abs(curY - startY),
      });
    } else if (mode === 'move') {
      this.nicDrawRect.set({
        side,
        left: Math.max(0, Math.min(100 - w0, curX - startX)),
        top: Math.max(0, Math.min(100 - h0, curY - startY)),
        width: w0,
        height: h0,
      });
    } else {
      // resize
      this.nicDrawRect.set({
        side,
        left: startX,
        top: startY,
        width: Math.max(2, curX - startX),
        height: Math.max(1, curY - startY),
      });
    }
  }

  protected onPanelMouseUp(event: MouseEvent): void {
    if (!this.nicInteractState) return;
    const draw = this.nicDrawRect();
    const { mode, nicId } = this.nicInteractState;
    this.nicInteractState = null;
    this.nicDraggingId.set(null);

    if (!draw) return;

    if (mode === 'draw') {
      // Ignore accidental clicks (too small)
      if (draw.width < 2 || draw.height < 1) {
        this.nicDrawRect.set(null);
        return;
      }
      const placingId = this.nicPlacingId();
      if (!placingId) {
        this.nicDrawRect.set(null);
        return;
      }
      this.nicSvc
        .patch(placingId, {
          side: draw.side === 'front' ? SideEnum.Front : SideEnum.Rear,
          pos_x: draw.left,
          pos_y: draw.top,
          width: draw.width,
          height: draw.height,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (saved) => {
            this.nicList.update((list) =>
              list.map((n) => (n.id === saved.id ? saved : n)),
            );
            this.nicPlacingId.set(null);
            this.nicDrawRect.set(null);
          },
        });
    } else {
      if (!nicId) {
        this.nicDrawRect.set(null);
        return;
      }
      this.nicSvc
        .patch(nicId, {
          side: draw.side === 'front' ? SideEnum.Front : SideEnum.Rear,
          pos_x: draw.left,
          pos_y: draw.top,
          width: draw.width,
          height: draw.height,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (saved) => {
            this.nicList.update((list) =>
              list.map((n) => (n.id === saved.id ? saved : n)),
            );
            this.nicDrawRect.set(null);
          },
        });
    }
  }

  protected clearNicPosition(id: number): void {
    this.nicSvc
      .patch(id, { pos_x: null, pos_y: null, width: null, height: null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) =>
          this.nicList.update((list) =>
            list.map((n) => (n.id === saved.id ? saved : n)),
          ),
      });
  }
}
