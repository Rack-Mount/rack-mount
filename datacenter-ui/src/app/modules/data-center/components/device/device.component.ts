import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, ElementRef, input } from '@angular/core';
import { RackUnit } from '../../../core/api/v1';
import { environment } from '../../../../../environments/environment';

/**
 * Maps device_type names (case-insensitive) to a CSS modifier class
 * used for the colored left-border accent.
 */
const TYPE_CLASS_MAP: Record<string, string> = {
  server:   'server',
  switch:   'switch',
  router:   'router',
  firewall: 'firewall',
  storage:  'storage',
  pdu:      'pdu',
  kvm:      'kvm',
  ups:      'ups',
};

/**
 * Placeholder icon (emoji) shown when the device has no front image.
 */
const TYPE_ICON_MAP: Record<string, string> = {
  server:   '🖥',
  switch:   '🔀',
  router:   '🌐',
  firewall: '🛡',
  storage:  '💾',
  pdu:      '⚡',
  kvm:      '🖱',
  ups:      '🔋',
};

@Component({
  selector: 'app-device',
  imports: [],
  templateUrl: './device.component.html',
  styleUrl: './device.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceComponent {
  readonly device   = input<RackUnit>();
  readonly position = input<number>();

  protected tooltipVisible = false;
  /** Fixed-position coords for the tooltip (avoids overflow clipping). */
  protected tooltipTop  = 0;
  protected tooltipLeft = 0;
  protected readonly serviceUrl = environment.service_url;

  constructor(
    private readonly el:  ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  /** CSS modifier class derived from device_type (e.g. 'server', 'switch'). */
  protected readonly typeClass = computed(() => {
    const t = (this.device()?.device_type ?? '').toLowerCase();
    return TYPE_CLASS_MAP[t] ?? 'other';
  });

  /** Fallback icon when the device has no front image. */
  protected readonly typeIcon = computed(() => {
    const t = (this.device()?.device_type ?? '').toLowerCase();
    return TYPE_ICON_MAP[t] ?? '📦';
  });

  protected showTooltip(): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    this.tooltipTop  = rect.top + rect.height / 2;
    this.tooltipLeft = rect.right + 8;
    this.tooltipVisible = true;
    this.cdr.markForCheck();
  }

  protected hideTooltip(): void {
    this.tooltipVisible = false;
    this.cdr.markForCheck();
  }
}
