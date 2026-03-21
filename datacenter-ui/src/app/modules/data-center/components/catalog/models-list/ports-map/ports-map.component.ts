import { SlicePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  ASSET_MODEL_PORT_TYPES,
  AssetModelPort,
  AssetModelPortType,
} from '../../../../../core/api/v1/model/assetModelPort';
import { PortTypeEnum } from '../../../../../core/api/v1/model/portTypeEnum';
import { PortAnalyzerService } from '../port-analyzer/port-analyzer.service';

export interface PortPickEvent {
  portId: number;
  pos_x: number;
  pos_y: number;
}

export interface PortAddEvent {
  name: string;
  port_type: PortTypeEnum;
  pos_x: number;
  pos_y: number;
}

export interface PortEditEvent {
  portId: number;
  name: string;
  port_type: PortTypeEnum;
}

interface QuickAdd {
  pos_x: number;
  pos_y: number;
  clientX: number;
  clientY: number;
  name: string;
  port_type: PortTypeEnum;
  /** Set when editing an existing port (double-click). */
  editingPortId?: number;
  /** True while the backend is analyzing the click area. */
  loading?: boolean;
  /**
   * Il tipo rilevato automaticamente (YOLO o OpenCV) o quello salvato in DB
   * al momento dell'apertura del form. Usato per rilevare se l'utente ha
   * corretto il tipo e inviare la correzione al backend.
   */
  predictedPortType?: PortTypeEnum;
}

@Component({
  selector: 'app-ports-map',
  standalone: true,
  imports: [TranslatePipe, SlicePipe],
  templateUrl: './ports-map.component.html',
  styleUrl: './ports-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortsMapComponent {
  private readonly portAnalyzer = inject(PortAnalyzerService);

  readonly imageUrl = input.required<string>();
  readonly sideLabel = input<string>('');
  readonly ports = input<AssetModelPort[]>([]);
  readonly placingPortId = input<number | null>(null);
  /** When true, shows the "Identify ports" button and enables click-to-add / ctrl+click-to-remove. */
  readonly analyzeEnabled = input<boolean>(false);
  /** Which side (front/rear) this map is showing – used as the side field for new ports. */
  readonly currentSide = input<'front' | 'rear'>('rear');

  readonly portPicked = output<PortPickEvent>();
  readonly closed = output<void>();
  readonly portHovered = output<number | null>();
  /** Emitted when the user adds a new port via click or by confirming a suggestion. */
  readonly portAdded = output<PortAddEvent>();
  /** Emitted when the user ctrl+clicks an existing port marker to delete it. */
  readonly portRemoved = output<number>();
  /** Emitted when the user double-clicks an existing port marker and saves changes. */
  readonly portEdited = output<PortEditEvent>();

  @ViewChild('imgEl') imgElRef!: ElementRef<HTMLImageElement>;
  @ViewChild('quickInput') quickInputRef?: ElementRef<HTMLInputElement>;

  protected readonly hoveredPortId = signal<number | null>(null);
  protected readonly portTypes = ASSET_MODEL_PORT_TYPES;

  protected readonly quickAdd = signal<QuickAdd | null>(null);

  /** Remembers the last port type used so the quick-add popup pre-selects it. */
  protected readonly lastPortType = signal<PortTypeEnum>(
    (localStorage.getItem('portsMap.lastPortType') as PortTypeEnum) ??
      ('RJ45' as PortTypeEnum),
  );

  /** Non-null while the user is dragging a saved port marker. */
  protected readonly draggingPort = signal<{
    portId: number;
    pos_x: number;
    pos_y: number;
  } | null>(null);

  /** Set to true the first time the pointer actually moves during a drag. */
  private wasDrag = false;

  protected readonly isPlacingMode = computed(
    () => this.placingPortId() !== null,
  );

  protected readonly positionedPorts = computed(() => {
    const drag = this.draggingPort();
    return this.ports()
      .filter((p) => p.pos_x !== null && p.pos_y !== null)
      .map((p) =>
        drag && p.id === drag.portId
          ? { ...p, pos_x: drag.pos_x, pos_y: drag.pos_y }
          : p,
      );
  });

  /** Clamp the quick-add popup so it never overflows the viewport. */
  protected readonly quickLeft = computed(() => {
    const q = this.quickAdd();
    if (!q) return 0;
    return Math.min(q.clientX + 14, window.innerWidth - 260);
  });

  protected readonly quickTop = computed(() => {
    const q = this.quickAdd();
    if (!q) return 0;
    return Math.min(q.clientY + 14, window.innerHeight - 165);
  });

  constructor() {
    // Auto-focus the name input whenever the quick-add popup opens.
    effect(() => {
      if (this.quickAdd()) {
        setTimeout(() => this.quickInputRef?.nativeElement?.focus(), 40);
      }
    });
  }

  protected portTypeLabel(type: AssetModelPortType | undefined): string {
    if (!type) return '';
    return (
      ASSET_MODEL_PORT_TYPES.find(
        (t: { value: PortTypeEnum; label: string }) => t.value === type,
      )?.label ?? type
    );
  }

  protected confPct(confidence: number): string {
    return Math.round(confidence * 100) + '%';
  }

  /**
   * Returns the CSS class string for a port face based on its type.
   * Class names use lowercase + underscores so special chars (+ -) are safe.
   */
  protected portFaceClass(type: AssetModelPortType | undefined): string {
    const slug = (type ?? 'other')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');
    return `pm-port-face pm-port-face--${slug}`;
  }

  /**
   * Suggests the next port name by continuing the numeric sequence found in
   * existing port names. E.g. if ports contain "eth0", "eth1" → returns "eth2".
   * Falls back to "Port N" when no pattern is detected.
   */
  private nextPortName(): string {
    const names = this.ports().map((p) => p.name ?? '');
    if (!names.length) return 'Port 1';

    const pattern = /^(.*?)(\d+)$/;
    const matches = names
      .map((n) => pattern.exec(n))
      .filter((m): m is RegExpExecArray => m !== null);

    if (matches.length) {
      const best = matches.reduce((a, b) =>
        parseInt(b[2], 10) > parseInt(a[2], 10) ? b : a,
      );
      const nextNum = parseInt(best[2], 10) + 1;
      const padded = best[2].startsWith('0')
        ? String(nextNum).padStart(best[2].length, '0')
        : String(nextNum);
      return `${best[1]}${padded}`;
    }

    return `Port ${names.length + 1}`;
  }

  // ── Click handlers ───────────────────────────────────────────────────────

  protected onOverlayClick(): void {
    if (this.quickAdd()) {
      this.quickAdd.set(null);
      return;
    }
    this.closed.emit();
  }

  protected onImageClick(event: MouseEvent): void {
    // Close open quick-add on any bare image click.
    if (this.quickAdd()) {
      this.quickAdd.set(null);
      return;
    }

    const img = this.imgElRef.nativeElement;
    const rect = img.getBoundingClientRect();
    const x = +(((event.clientX - rect.left) / rect.width) * 100).toFixed(2);
    const y = +(((event.clientY - rect.top) / rect.height) * 100).toFixed(2);

    // Legacy "place existing port" mode.
    const pid = this.placingPortId();
    if (pid !== null) {
      this.portPicked.emit({ portId: pid, pos_x: x, pos_y: y });
      return;
    }

    if (!this.analyzeEnabled()) return;
    if (event.altKey) return;

    // Mostra subito il segnaposto di caricamento al punto di click
    this.quickAdd.set({
      pos_x: x,
      pos_y: y,
      clientX: event.clientX,
      clientY: event.clientY,
      name: '',
      port_type: this.lastPortType(),
      loading: true,
    });

    // Analizza l'area con YOLO + OCR sul backend
    this.portAnalyzer
      .analyzeClick(this.imageUrl(), this.currentSide(), x, y)
      .then((result) => {
        const name = result.name ?? this.nextPortName();
        const portType = result.port_type ?? this.lastPortType();
        this.quickAdd.update((q) =>
          q
            ? {
                ...q,
                name,
                port_type: portType,
                predictedPortType: portType,
                loading: false,
              }
            : null,
        );
      })
      .catch(() => {
        this.quickAdd.update((q) =>
          q ? { ...q, name: this.nextPortName(), loading: false } : null,
        );
      });
  }

  protected onMarkerClick(portId: number, event: MouseEvent): void {
    // Ignore clicks that were actually the end of a drag gesture.
    if (this.wasDrag) {
      this.wasDrag = false;
      return;
    }
    event.stopPropagation();
    if (event.altKey) {
      if (this.analyzeEnabled()) {
        const port = this.ports().find((p) => p.id === portId);
        if (port?.pos_x != null && port?.pos_y != null) {
          this.portAnalyzer.removeAnnotation(
            this.imageUrl(),
            this.currentSide(),
            port.pos_x,
            port.pos_y,
          );
        }
        this.portRemoved.emit(portId);
      }
      return;
    }
    this.hoveredPortId.update((cur) => (cur === portId ? null : portId));
  }

  protected onMarkerDblClick(portId: number, event: MouseEvent): void {
    if (!this.analyzeEnabled()) return;
    event.stopPropagation();
    const port = this.ports().find((p) => p.id === portId);
    if (!port) return;
    const existingType = (port.port_type as PortTypeEnum) ?? ('RJ45' as PortTypeEnum);
    this.quickAdd.set({
      pos_x: port.pos_x ?? 0,
      pos_y: port.pos_y ?? 0,
      clientX: event.clientX,
      clientY: event.clientY,
      name: port.name ?? '',
      port_type: existingType,
      predictedPortType: existingType,
      editingPortId: portId,
    });
  }

  protected onMarkerPointerDown(portId: number, event: PointerEvent): void {
    if (!this.analyzeEnabled()) return;
    if (event.altKey) return; // altKey is for removal, not drag
    event.stopPropagation();
    event.preventDefault();
    const port = this.ports().find((p) => p.id === portId);
    if (!port || port.pos_x == null || port.pos_y == null) return;
    this.wasDrag = false;
    this.draggingPort.set({ portId, pos_x: port.pos_x!, pos_y: port.pos_y! });
  }

  @HostListener('document:pointermove', ['$event'])
  protected onDocPointerMove(event: PointerEvent): void {
    const drag = this.draggingPort();
    if (!drag) return;
    const img = this.imgElRef?.nativeElement;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const x = parseFloat(
      Math.max(
        0,
        Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
      ).toFixed(2),
    );
    const y = parseFloat(
      Math.max(
        0,
        Math.min(100, ((event.clientY - rect.top) / rect.height) * 100),
      ).toFixed(2),
    );
    this.wasDrag = true;
    this.draggingPort.set({ portId: drag.portId, pos_x: x, pos_y: y });
  }

  @HostListener('document:pointerup')
  protected onDocPointerUp(): void {
    const drag = this.draggingPort();
    if (!drag) return;
    this.draggingPort.set(null);
    if (this.wasDrag) {
      this.portPicked.emit({
        portId: drag.portId,
        pos_x: drag.pos_x,
        pos_y: drag.pos_y,
      });
    }
    // wasDrag is reset inside onMarkerClick which fires after pointerup
  }

  // ── Quick-add form ───────────────────────────────────────────────────────

  protected setQuickField(key: 'name' | 'port_type', value: string): void {
    this.quickAdd.update((q) => (q ? { ...q, [key]: value } : null));
  }

  protected cancelQuickAdd(): void {
    this.quickAdd.set(null);
  }

  protected submitQuickAdd(): void {
    const q = this.quickAdd();
    if (!q || !q.name.trim()) return;

    if (q.editingPortId != null) {
      const orig = this.ports().find((p) => p.id === q.editingPortId);
      if (orig?.pos_x != null && orig?.pos_y != null) {
        this.portAnalyzer.learnFromAnnotation(
          this.imageUrl(),
          this.currentSide(),
          {
            name: q.name.trim(),
            port_type: q.port_type,
            pos_x: orig.pos_x,
            pos_y: orig.pos_y,
          },
        );
        // Segnala la correzione al backend se il tipo è cambiato
        if (q.predictedPortType && q.predictedPortType !== q.port_type) {
          this.portAnalyzer.reportCorrection(
            this.imageUrl(),
            this.currentSide(),
            orig.pos_x,
            orig.pos_y,
            q.predictedPortType,
            q.port_type,
          );
        }
      }
      this.portEdited.emit({
        portId: q.editingPortId,
        name: q.name.trim(),
        port_type: q.port_type,
      });
      this.quickAdd.set(null);
      return;
    }

    this.lastPortType.set(q.port_type);
    localStorage.setItem('portsMap.lastPortType', q.port_type);
    this.portAdded.emit({
      name: q.name.trim(),
      port_type: q.port_type,
      pos_x: q.pos_x,
      pos_y: q.pos_y,
    });
    // Insegna al backend per futuri rilevamenti
    this.portAnalyzer.learnFromAnnotation(this.imageUrl(), this.currentSide(), {
      name: q.name.trim(),
      port_type: q.port_type,
      pos_x: q.pos_x,
      pos_y: q.pos_y,
    });
    // Se l'utente ha cambiato il tipo rispetto a quello predetto, invia la correzione
    if (q.predictedPortType && q.predictedPortType !== q.port_type) {
      this.portAnalyzer.reportCorrection(
        this.imageUrl(),
        this.currentSide(),
        q.pos_x,
        q.pos_y,
        q.predictedPortType,
        q.port_type,
      );
    }
    this.quickAdd.set(null);
  }

  protected onPortHover(id: number | null): void {
    this.hoveredPortId.set(id);
    this.portHovered.emit(id);
  }

  @HostListener('document:keydown.escape')
  protected onEsc(): void {
    if (this.quickAdd()) {
      this.quickAdd.set(null);
      return;
    }
    this.closed.emit();
  }
}
