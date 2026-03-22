import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, Observable, of, startWith, switchMap } from 'rxjs';
import { environment } from '../../../../../../../environments/environment';
import { Asset, AssetService } from '../../../../../core/api/v1';
import { MediaUrlService } from '../../../../../core/services/media-url.service';
import { formatDate, stateColor } from '../../assets-list/assets-list-utils';

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
  private readonly mediaUrlService = inject(MediaUrlService);

  protected readonly serviceUrl = environment.service_url;
  protected readonly stateColor = stateColor;
  protected readonly formatDate = formatDate;
  protected readonly today = new Date().toISOString().slice(0, 10);

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

  private readonly frontImagePath = computed(() => {
    const a = this.asset();
    if (!a) return null;
    const img = a.model.front_image;
    if (!img) return null;
    return img;
  });

  private readonly rearImagePath = computed(() => {
    const a = this.asset();
    if (!a) return null;
    const img = a.model.rear_image;
    if (!img) return null;
    return img;
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
    const d = a.warranty_expiration;
    return !!d && d < this.today;
  });

  protected readonly supportExpired = computed(() => {
    const a = this.asset();
    if (!a) return false;
    const d = a.support_expiration;
    return !!d && d < this.today;
  });
}
