import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { RackUnit } from '../../../../core/api/v1';
import { MediaUrlService } from '../../../../core/services/media-url.service';

/**
 * Maps device_type names (case-insensitive) to a CSS modifier class
 * used for the colored left-border accent.
 */
const TYPE_CLASS_MAP: Record<string, string> = {
  server: 'server',
  switch: 'switch',
  router: 'router',
  firewall: 'firewall',
  storage: 'storage',
  pdu: 'pdu',
  kvm: 'kvm',
  ups: 'ups',
};

/**
 * Placeholder icon (emoji) shown when the device has no front image.
 */
const TYPE_ICON_MAP: Record<string, string> = {
  server: '🖥',
  switch: '🔀',
  router: '🌐',
  firewall: '🛡',
  storage: '💾',
  pdu: '⚡',
  kvm: '🖱',
  ups: '🔋',
};

@Component({
  selector: 'app-device',
  imports: [],
  templateUrl: './device.component.html',
  styleUrl: './device.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceComponent {
  readonly device = input<RackUnit>();
  readonly position = input<number>();
  /** True when the rack is shown from the rear face. */
  readonly rearView = input<boolean>(false);

  protected readonly tooltipVisible = signal(false);
  /** Fixed-position coords for the tooltip (avoids overflow clipping). */
  protected readonly tooltipTop = signal(0);
  protected readonly tooltipLeft = signal(0);
  /** True when the tooltip is flipped to the left side of the device. */
  protected readonly tooltipFlipped = signal(false);
  protected readonly serviceUrl = environment.service_url;

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly mediaUrlService = inject(MediaUrlService);

  /** CSS modifier class derived from device_type (e.g. 'server', 'switch'). */
  protected readonly typeClass = computed(() => {
    const t = (this.device()?.device_type ?? '').toLowerCase();
    return TYPE_CLASS_MAP[t] ?? 'other';
  });

  /** The image path to display: rear image when in rear view, front otherwise. Falls back to the other face if one is missing. */
  protected readonly activeImage = computed(() => {
    const dev = this.device();
    if (!dev) return null;
    if (this.rearView()) {
      return dev.device_rear_image || dev.device_image || null;
    }
    return dev.device_image || dev.device_rear_image || null;
  });

  protected readonly activeImageUrl = toSignal(
    toObservable(this.activeImage).pipe(
      switchMap((img) =>
        img ? this.mediaUrlService.resolveImageUrl(img, 320) : of(null),
      ),
    ),
    { initialValue: null },
  );

  /** Fallback icon when the device has no front image. */
  protected readonly typeIcon = computed(() => {
    const t = (this.device()?.device_type ?? '').toLowerCase();
    return TYPE_ICON_MAP[t] ?? '📦';
  });

  protected showTooltip(): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const tooltipW = 260; // max-width from CSS
    const vw = window.innerWidth;

    // Horizontal: prefer right side, flip left if it would overflow
    if (rect.right + 8 + tooltipW <= vw - 4) {
      this.tooltipLeft.set(rect.right + 8);
      this.tooltipFlipped.set(false);
    } else {
      this.tooltipLeft.set(Math.max(4, rect.left - 8 - tooltipW));
      this.tooltipFlipped.set(true);
    }

    // Render off-screen first, then measure actual height and reposition
    this.tooltipTop.set(-9999);
    this.tooltipVisible.set(true);

    setTimeout(() => {
      if (!this.tooltipVisible()) return;
      const tooltipEl = this.el.nativeElement.querySelector(
        '.device__tooltip',
      ) as HTMLElement | null;
      const tooltipH = tooltipEl?.offsetHeight ?? 160;
      const vh = window.innerHeight;
      const ideal = rect.top + rect.height / 2;
      this.tooltipTop.set(
        Math.max(tooltipH / 2 + 4, Math.min(ideal, vh - tooltipH / 2 - 4)),
      );
    });
  }

  protected hideTooltip(): void {
    this.tooltipVisible.set(false);
  }
}
