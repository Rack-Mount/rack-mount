import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
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

export interface PortPickEvent {
  portId: number;
  pos_x: number;
  pos_y: number;
}

@Component({
  selector: 'app-ports-map',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './ports-map.component.html',
  styleUrl: './ports-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortsMapComponent {
  /** URL of the image to display (full-res). */
  readonly imageUrl = input.required<string>();
  /** Side label shown in header ('Front' | 'Rear'). */
  readonly sideLabel = input<string>('');
  /** All ports to overlay on this image side. */
  readonly ports = input<AssetModelPort[]>([]);
  /**
   * When set, the component enters "place" mode:
   * clicking the image emits portPicked with this port's id and the click coords.
   */
  readonly placingPortId = input<number | null>(null);

  /** Emitted when an image click places a port position. */
  readonly portPicked = output<PortPickEvent>();
  /** Emitted when the user clicks the close button. */
  readonly closed = output<void>();
  /** Emitted when user clicks a port marker (for highlighting in table). */
  readonly portHovered = output<number | null>();

  @ViewChild('imgEl') imgElRef!: ElementRef<HTMLImageElement>;

  protected readonly hoveredPortId = signal<number | null>(null);
  protected readonly portTypes = ASSET_MODEL_PORT_TYPES;

  protected readonly isPlacingMode = computed(
    () => this.placingPortId() !== null,
  );

  protected readonly positionedPorts = computed(() =>
    this.ports().filter((p) => p.pos_x !== null && p.pos_y !== null),
  );

  protected portTypeLabel(type: AssetModelPortType | undefined): string {
    if (!type) return '';
    return (
      ASSET_MODEL_PORT_TYPES.find(
        (t: { value: PortTypeEnum; label: string }) => t.value === type,
      )?.label ?? type
    );
  }

  protected onImageClick(event: MouseEvent): void {
    const pid = this.placingPortId();
    if (pid === null) return;
    const img = this.imgElRef.nativeElement;
    const rect = img.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    this.portPicked.emit({
      portId: pid,
      pos_x: +x.toFixed(2),
      pos_y: +y.toFixed(2),
    });
  }

  protected onPortHover(id: number | null): void {
    this.hoveredPortId.set(id);
    this.portHovered.emit(id);
  }

  @HostListener('document:keydown.escape')
  protected onEsc(): void {
    this.closed.emit();
  }
}
