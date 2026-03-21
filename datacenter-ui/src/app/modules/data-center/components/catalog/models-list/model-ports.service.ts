import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AssetService } from '../../../../core/api/v1';
import { AssetModelPort } from '../../../../core/api/v1/model/assetModelPort';
import {
  ASSET_MODEL_PORT_TYPES,
  AssetModelPortSide,
  AssetModelPortType,
} from './port-types';
import {
  PortAddEvent,
  PortEditEvent,
  PortPickEvent,
} from './ports-map/ports-map.component';

export interface PortForm {
  name: string;
  port_type: AssetModelPortType;
  side: AssetModelPortSide;
  notes: string;
}

const EMPTY_PORT_FORM: PortForm = {
  name: '',
  port_type: 'RJ45',
  side: 'rear',
  notes: '',
};

/**
 * Manages all port-related state and API operations for the asset model drawer.
 * Provided at ModelsListComponent level so it is destroyed with the component.
 */
@Injectable()
export class ModelPortsService {
  private readonly svc = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Ports data ─────────────────────────────────────────────────────────────
  readonly ports = signal<AssetModelPort[]>([]);
  readonly portsLoading = signal(false);
  readonly portTypes = ASSET_MODEL_PORT_TYPES;
  readonly frontPorts = computed(() =>
    this.ports().filter((p) => p.side === ('front' as const)),
  );
  readonly rearPorts = computed(() =>
    this.ports().filter((p) => p.side === ('rear' as const)),
  );

  // ── Port inline form ────────────────────────────────────────────────────────
  readonly portFormOpen = signal(false);
  readonly portFormMode = signal<'create' | 'edit'>('create');
  readonly portEditId = signal<number | null>(null);
  readonly portForm = signal<PortForm>(EMPTY_PORT_FORM);
  readonly portSaveState = signal<'idle' | 'saving' | 'error'>('idle');
  readonly portDeleteId = signal<number | null>(null);
  readonly portDeleteState = signal<'idle' | 'saving' | 'error'>('idle');

  // ── Ports map ───────────────────────────────────────────────────────────────
  readonly portsMapOpen = signal<{
    side: 'front' | 'rear';
    imageUrl: string;
    readonly: boolean;
  } | null>(null);

  readonly placingPortId = signal<number | null>(null);

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Resets all port state when the drawer closes. */
  reset(): void {
    this.ports.set([]);
    this.portFormOpen.set(false);
    this.portEditId.set(null);
    this.portsMapOpen.set(null);
    this.placingPortId.set(null);
  }

  // ── Port CRUD ───────────────────────────────────────────────────────────────

  loadPortsForModel(modelId: number): void {
    this.portsLoading.set(true);
    this.svc
      .assetAssetModelPortList({ assetModel: modelId, pageSize: 500 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.ports.set(r.results ?? []);
          this.portsLoading.set(false);
        },
        error: () => this.portsLoading.set(false),
      });
  }

  openPortCreate(): void {
    this.portFormMode.set('create');
    this.portEditId.set(null);
    this.portForm.set({ ...EMPTY_PORT_FORM });
    this.portSaveState.set('idle');
    this.portFormOpen.set(true);
  }

  openPortEdit(p: AssetModelPort): void {
    this.portFormMode.set('edit');
    this.portEditId.set(p.id);
    this.portForm.set({
      name: p.name ?? '',
      port_type: p.port_type ?? 'RJ45',
      side: p.side ?? 'rear',
      notes: p.notes ?? '',
    });
    this.portSaveState.set('idle');
    this.portFormOpen.set(true);
  }

  setPortField<K extends keyof PortForm>(key: K, value: PortForm[K]): void {
    this.portForm.update((f) => ({ ...f, [key]: value }));
  }

  submitPortForm(modelId: number | null): void {
    if (!modelId) return;
    const f = this.portForm();
    if (!f.name.trim()) return;

    this.portSaveState.set('saving');

    if (this.portFormMode() === 'create') {
      this.svc
        .assetAssetModelPortCreate({
          assetModelPort: {
            asset_model: modelId,
            name: f.name.trim(),
            port_type: f.port_type,
            side: f.side,
            notes: f.notes,
            pos_x: null,
            pos_y: null,
          } as AssetModelPort,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (saved: AssetModelPort) => {
            this.ports.update((prev) => [...prev, saved]);
            this.portSaveState.set('idle');
            this.portFormOpen.set(false);
          },
          error: () => this.portSaveState.set('error'),
        });
    } else {
      const id = this.portEditId()!;
      this.svc
        .assetAssetModelPortPartialUpdate({
          id,
          patchedAssetModelPort: {
            name: f.name.trim(),
            port_type: f.port_type,
            side: f.side,
            notes: f.notes,
          },
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (saved: AssetModelPort) => {
            this.ports.update((prev) =>
              prev.map((p) => (p.id === id ? saved : p)),
            );
            this.portSaveState.set('idle');
            this.portFormOpen.set(false);
          },
          error: () => this.portSaveState.set('error'),
        });
    }
  }

  confirmDeletePort(id: number): void {
    this.portDeleteId.set(id);
    this.portDeleteState.set('idle');
  }

  cancelDeletePort(): void {
    this.portDeleteId.set(null);
  }

  submitDeletePort(): void {
    const id = this.portDeleteId();
    if (!id) return;
    this.portDeleteState.set('saving');
    this.svc
      .assetAssetModelPortDestroy({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ports.update((prev) => prev.filter((p) => p.id !== id));
          this.portDeleteId.set(null);
          this.portDeleteState.set('idle');
          if (this.placingPortId() === id) this.placingPortId.set(null);
        },
        error: () => this.portDeleteState.set('error'),
      });
  }

  // ── Ports map ───────────────────────────────────────────────────────────────

  openPortsMap(
    side: string | undefined,
    imageUrl: string,
    readonly: boolean,
  ): void {
    this.portsMapOpen.set({
      side: (side || 'front') as 'front' | 'rear',
      imageUrl,
      readonly,
    });
    if (!readonly) this.placingPortId.set(null);
  }

  closePortsMap(): void {
    this.portsMapOpen.set(null);
    this.placingPortId.set(null);
  }

  startPlacingPort(portId: number): void {
    this.placingPortId.set(portId);
  }

  stopPlacingPort(): void {
    this.placingPortId.set(null);
  }

  onPortPicked(event: PortPickEvent): void {
    this.svc
      .assetAssetModelPortPartialUpdate({
        id: event.portId,
        patchedAssetModelPort: { pos_x: event.pos_x, pos_y: event.pos_y },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved: AssetModelPort) => {
          this.ports.update((prev) =>
            prev.map((p) => (p.id === saved.id ? saved : p)),
          );
          this.placingPortId.set(null);
        },
      });
  }

  clearPortPosition(portId: number): void {
    this.svc
      .assetAssetModelPortPartialUpdate({
        id: portId,
        patchedAssetModelPort: { pos_x: null, pos_y: null },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved: AssetModelPort) => {
          this.ports.update((prev) =>
            prev.map((p) => (p.id === saved.id ? saved : p)),
          );
        },
      });
  }

  portTypeLabel(type: AssetModelPortType | undefined): string {
    if (!type) return '';
    return (
      ASSET_MODEL_PORT_TYPES.find(
        (t: { value: AssetModelPortType; label: string }) => t.value === type,
      )?.label ?? type
    );
  }

  // ── Port map events ─────────────────────────────────────────────────────────

  onPortAddedFromMap(event: PortAddEvent, modelId: number | null): void {
    if (!modelId) return;
    const side = this.portsMapOpen()?.side ?? 'rear';
    this.svc
      .assetAssetModelPortCreate({
        assetModelPort: {
          asset_model: modelId,
          name: event.name,
          port_type: event.port_type,
          side,
          notes: '',
          pos_x: event.pos_x,
          pos_y: event.pos_y,
        } as AssetModelPort,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved: AssetModelPort) =>
          this.ports.update((prev) => [...prev, saved]),
      });
  }

  onPortRemovedFromMap(portId: number): void {
    this.svc
      .assetAssetModelPortDestroy({ id: portId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ports.update((prev) => prev.filter((p) => p.id !== portId));
          if (this.placingPortId() === portId) this.placingPortId.set(null);
        },
      });
  }

  onPortEditedFromMap(event: PortEditEvent): void {
    this.svc
      .assetAssetModelPortPartialUpdate({
        id: event.portId,
        patchedAssetModelPort: {
          name: event.name,
          port_type: event.port_type,
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved: AssetModelPort) =>
          this.ports.update((prev) =>
            prev.map((p) => (p.id === saved.id ? saved : p)),
          ),
      });
  }
}
