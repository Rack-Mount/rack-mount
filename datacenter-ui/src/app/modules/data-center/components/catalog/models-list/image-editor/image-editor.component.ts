import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ImageEditParams {
  /** 4 corner points (TL, TR, BR, BL) in original-image pixel coords. null = no warp. */
  perspective:
    | [[number, number], [number, number], [number, number], [number, number]]
    | null;
  /** Crop rect in perspective-corrected output pixels. null = no crop. */
  crop: { x: number; y: number; w: number; h: number } | null;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export type EditorMode = 'perspective' | 'crop' | 'transform';

// ── Internal constants ────────────────────────────────────────────────────────

const HANDLE_R = 10; // handle circle radius (px, canvas space)
const CROP_HANDLE_R = 8; // crop handle radius
const GRID_N = 32; // triangle-mesh grid size for perspective preview

// ── Helpers ────────────────────────────────────────────────────────────────

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Solve Ax = b (n×n) via Gauss–Jordan with partial pivoting. */
function gauss(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) continue;
    const inv = 1 / M[col][col];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col] * inv;
      for (let c = col; c <= n; c++) M[row][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Compute the 3×3 homography H (row-major, 9 elements) that maps destination
 * pixels (dx, dy) → source image pixels (sx, sy):
 *   [sx, sy, w]^T = H * [dx, dy, 1]^T   →   actual src = (sx/w, sy/w)
 *
 * Destination corners: TL=(0,0), TR=(dstW,0), BR=(dstW,dstH), BL=(0,dstH)
 * Source  corners:     tl, tr, br, bl  (in original-image pixel coords)
 */
function buildHomography(
  tl: [number, number],
  tr: [number, number],
  br: [number, number],
  bl: [number, number],
  dstW: number,
  dstH: number,
): number[] {
  const dstPts: [number, number][] = [
    [0, 0],
    [dstW, 0],
    [dstW, dstH],
    [0, dstH],
  ];
  const srcPts: [number, number][] = [tl, tr, br, bl];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [xi, yi] = dstPts[i];
    const [Xi, Yi] = srcPts[i];
    A.push([xi, yi, 1, 0, 0, 0, -Xi * xi, -Xi * yi]);
    b.push(Xi);
    A.push([0, 0, 0, xi, yi, 1, -Yi * xi, -Yi * yi]);
    b.push(Yi);
  }
  const h = gauss(A, b);
  return [...h, 1]; // h33 = 1
}

/** Apply homography H to a destination point (dx,dy) → source (sx,sy). */
function applyH(H: number[], dx: number, dy: number): [number, number] {
  const w = H[6] * dx + H[7] * dy + H[8];
  return [
    (H[0] * dx + H[1] * dy + H[2]) / w,
    (H[3] * dx + H[4] * dy + H[5]) / w,
  ];
}

/** Solve affine coefficients (a,b,c,d,e,f) that map three src points to three dst points. */
function affineFromTriangles(
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
  dx0: number,
  dy0: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
): [number, number, number, number, number, number] {
  const det = (sx0 - sx2) * (sy1 - sy2) - (sx1 - sx2) * (sy0 - sy2);
  if (Math.abs(det) < 1e-10) return [1, 0, 0, 1, 0, 0];
  const a = ((dx0 - dx2) * (sy1 - sy2) - (dx1 - dx2) * (sy0 - sy2)) / det;
  const c = ((sx0 - sx2) * (dx1 - dx2) - (sx1 - sx2) * (dx0 - dx2)) / det;
  const e = dx0 - a * sx0 - c * sy0;
  const b = ((dy0 - dy2) * (sy1 - sy2) - (dy1 - dy2) * (sy0 - sy2)) / det;
  const d = ((sx0 - sx2) * (dy1 - dy2) - (sx1 - sx2) * (dy0 - dy2)) / det;
  const f = dy0 - b * sx0 - d * sy0;
  return [a, b, c, d, e, f];
}

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-image-editor',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './image-editor.component.html',
  styleUrl: './image-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageEditorComponent implements OnInit, OnDestroy {
  readonly imageFile = input<File | null>(null);
  readonly imageUrl = input<string | null>(null);

  readonly confirmed = output<{
    params: ImageEditParams;
    previewDataUrl: string;
  }>();
  readonly cancelled = output<void>();

  constructor() {
    effect(() => this.loadImage());
  }

  @ViewChild('editorCanvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('wrap', { static: true }) wrapRef!: ElementRef<HTMLDivElement>;

  // ── Mode ────────────────────────────────────────────────────────────────
  protected readonly mode = signal<EditorMode>('perspective');

  // ── Image state ──────────────────────────────────────────────────────────
  protected readonly imgLoaded = signal(false);
  protected readonly imgError = signal(false);

  private img = new Image();
  private blobUrl: string | null = null;

  get imgW(): number {
    return this.img.naturalWidth || 1;
  }
  get imgH(): number {
    return this.img.naturalHeight || 1;
  }

  // ── Perspective handles (image px, TL/TR/BR/BL) ─────────────────────────
  private perspPts: [number, number][] = [];

  // ── Crop rect (persp-corrected output px) ────────────────────────────────
  private cropX = 0;
  private cropY = 0;
  private cropW = 1;
  private cropH = 1;

  // ── Transform ────────────────────────────────────────────────────────────
  protected readonly rotation = signal<0 | 90 | 180 | 270>(0);
  protected readonly flipH = signal(false);
  protected readonly flipV = signal(false);

  // ── Canvas layout cache ───────────────────────────────────────────────────
  private canvasScale = 1;
  private offsetX = 0;
  private offsetY = 0;

  // ── Drag state ────────────────────────────────────────────────────────────
  /** perspective: 0-3 = corner handles; crop: 0 = move, 1-8 = resize, -1 = none */
  private activeHandle = -1;
  private dragMouseStart = { x: 0, y: 0 };
  private dragPerspStart: [number, number][] = [];
  private dragCropStart = { x: 0, y: 0, w: 1, h: 1 };

  // ── RAF ───────────────────────────────────────────────────────────────────
  private raf = 0;
  private resizeObs?: ResizeObserver;

  // ─────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const canvas = this.canvasRef.nativeElement;

    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mouseleave', this.onMouseUp);
    canvas.addEventListener('touchstart', this.onTouchStart, {
      passive: false,
    });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onMouseUp);

    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(this.wrapRef.nativeElement);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    const canvas = this.canvasRef.nativeElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('mouseleave', this.onMouseUp);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onMouseUp);
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Image loading
  // ─────────────────────────────────────────────────────────────────────────

  private async loadImage(): Promise<void> {
    this.imgLoaded.set(false);
    this.imgError.set(false);

    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }

    let src: string | null = null;

    if (this.imageFile()) {
      src = URL.createObjectURL(this.imageFile()!);
      this.blobUrl = src;
    } else if (this.imageUrl()) {
      try {
        const resp = await fetch(this.imageUrl()!);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        src = URL.createObjectURL(blob);
        this.blobUrl = src;
      } catch {
        this.imgError.set(true);
        return;
      }
    }

    if (!src) return;

    this.img = new Image();
    this.img.onload = () => {
      this.imgLoaded.set(true);
      this.resetParams();
      this.onResize();
    };
    this.img.onerror = () => {
      this.imgError.set(true);
    };
    this.img.src = src;
  }

  private resetParams(): void {
    const w = this.imgW;
    const h = this.imgH;
    this.perspPts = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];
    this.cropX = 0;
    this.cropY = 0;
    this.cropW = w;
    this.cropH = h;
    this.rotation.set(0);
    this.flipH.set(false);
    this.flipV.set(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Canvas layout
  // ─────────────────────────────────────────────────────────────────────────

  private onResize(): void {
    if (!this.imgLoaded()) return;
    const wrap = this.wrapRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const pad = 16;

    const cw = Math.max(100, wrap.clientWidth - pad * 2);
    const ch = Math.max(100, wrap.clientHeight - pad * 2);

    canvas.width = cw;
    canvas.height = ch;

    // Fit image within canvas
    const scale = Math.min(cw / this.imgW, ch / this.imgH, 1);
    this.canvasScale = scale;
    this.offsetX = Math.round((cw - this.imgW * scale) / 2);
    this.offsetY = Math.round((ch - this.imgH * scale) / 2);

    this.scheduleRedraw();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Coordinate helpers
  // ─────────────────────────────────────────────────────────────────────────

  private toCanvas(ix: number, iy: number): [number, number] {
    return [
      this.offsetX + ix * this.canvasScale,
      this.offsetY + iy * this.canvasScale,
    ];
  }

  private toImage(cx: number, cy: number): [number, number] {
    return [
      (cx - this.offsetX) / this.canvasScale,
      (cy - this.offsetY) / this.canvasScale,
    ];
  }

  private canvasXY(e: MouseEvent | Touch): [number, number] {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Perspective output size (computed from quad)
  // ─────────────────────────────────────────────────────────────────────────

  private getPerspOutSize(): { w: number; h: number } {
    const [tl, tr, br, bl] = this.perspPts as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];
    const w = Math.max(dist(tl, tr), dist(bl, br));
    const h = Math.max(dist(tl, bl), dist(tr, br));
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  /** Compute crop display metrics from the live canvas size — always up-to-date. */
  private getCropDisplay(): {
    pOffX: number;
    pOffY: number;
    pW: number;
    pH: number;
    perspW: number;
    perspH: number;
  } {
    const canvas = this.canvasRef.nativeElement;
    const cw = canvas.width || 1;
    const ch = canvas.height || 1;
    const { w: perspW, h: perspH } = this.getPerspOutSize();
    const pScale = Math.min(cw / perspW, ch / perspH, 1);
    const pW = Math.round(perspW * pScale);
    const pH = Math.round(perspH * pScale);
    const pOffX = Math.round((cw - pW) / 2);
    const pOffY = Math.round((ch - pH) / 2);
    return { pOffX, pOffY, pW, pH, perspW, perspH };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Draw
  // ─────────────────────────────────────────────────────────────────────────

  private scheduleRedraw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  }

  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    if (!this.imgLoaded()) return;

    if (this.mode() === 'perspective') {
      this.drawPerspMode(ctx, cw, ch);
    } else if (this.mode() === 'crop') {
      this.drawCropMode(ctx, cw, ch);
    } else {
      this.drawTransformMode(ctx, cw, ch);
    }
  }

  // ── Perspective mode ─────────────────────────────────────────────────────

  private drawPerspMode(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
  ): void {
    // Draw original image
    ctx.drawImage(
      this.img,
      this.offsetX,
      this.offsetY,
      this.imgW * this.canvasScale,
      this.imgH * this.canvasScale,
    );

    const pts = this.perspPts.map(([x, y]) => this.toCanvas(x, y)) as [
      number,
      number,
    ][];
    const [tl, tr, br, bl] = pts;

    // Dark overlay outside quad
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.moveTo(tl[0], tl[1]);
    ctx.lineTo(tr[0], tr[1]);
    ctx.lineTo(br[0], br[1]);
    ctx.lineTo(bl[0], bl[1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill('evenodd');
    ctx.restore();

    // Quad border
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl[0], tl[1]);
    ctx.lineTo(tr[0], tr[1]);
    ctx.lineTo(br[0], br[1]);
    ctx.lineTo(bl[0], bl[1]);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Corner handles
    const colors = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373'];
    pts.forEach(([cx, cy], i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = colors[i];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  // ── Crop mode ─────────────────────────────────────────────────────────────

  private drawCropMode(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
  ): void {
    const { w: perspW, h: perspH } = this.getPerspOutSize();
    const [tl, tr, br, bl] = this.perspPts as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];

    const { pOffX, pOffY, pW, pH } = this.getCropDisplay();

    // ── Draw perspective-warped preview using homography-based triangle mesh ─
    ctx.save();
    const H = buildHomography(tl, tr, br, bl, perspW, perspH);
    for (let row = 0; row < GRID_N; row++) {
      for (let col = 0; col < GRID_N; col++) {
        const u0 = col / GRID_N,
          u1 = (col + 1) / GRID_N;
        const v0 = row / GRID_N,
          v1 = (row + 1) / GRID_N;

        // Source corners via exact projective (homography) mapping
        const [sx00, sy00] = applyH(H, u0 * perspW, v0 * perspH);
        const [sx10, sy10] = applyH(H, u1 * perspW, v0 * perspH);
        const [sx01, sy01] = applyH(H, u0 * perspW, v1 * perspH);
        const [sx11, sy11] = applyH(H, u1 * perspW, v1 * perspH);

        // Destination corners (in canvas pixels)
        const dx0 = pOffX + u0 * pW,
          dx1 = pOffX + u1 * pW;
        const dy0 = pOffY + v0 * pH,
          dy1 = pOffY + v1 * pH;

        this.drawTriangle(
          ctx,
          sx00,
          sy00,
          sx10,
          sy10,
          sx01,
          sy01,
          dx0,
          dy0,
          dx1,
          dy0,
          dx0,
          dy1,
        );
        this.drawTriangle(
          ctx,
          sx10,
          sy10,
          sx11,
          sy11,
          sx01,
          sy01,
          dx1,
          dy0,
          dx1,
          dy1,
          dx0,
          dy1,
        );
      }
    }
    ctx.restore();

    // ── Crop overlay ──────────────────────────────────────────────────────
    const toCX = (x: number) => pOffX + (x / perspW) * pW;
    const toCY = (y: number) => pOffY + (y / perspH) * pH;

    const cx = toCX(this.cropX);
    const cy = toCY(this.cropY);
    const cRW = (this.cropW / perspW) * pW;
    const cRH = (this.cropH / perspH) * pH;

    // Dimmed outside crop
    ctx.save();
    ctx.beginPath();
    ctx.rect(pOffX, pOffY, pW, pH);
    ctx.rect(cx, cy, cRW, cRH);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill('evenodd');
    ctx.restore();

    // Rule-of-thirds grid lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + (cRW * i) / 3, cy);
      ctx.lineTo(cx + (cRW * i) / 3, cy + cRH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + (cRH * i) / 3);
      ctx.lineTo(cx + cRW, cy + (cRH * i) / 3);
      ctx.stroke();
    }
    ctx.restore();

    // Crop border
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cy, cRW, cRH);
    ctx.restore();

    // 8 resize handles + 4 corner L-brackets
    const handles = this.getCropHandlePositions(cx, cy, cRW, cRH);
    handles.forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(hx, hy, CROP_HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // (persp display metrics now computed on-demand via getCropDisplay())
  }

  /** Draw one affine-mapped triangle from src image to dst canvas. */
  private drawTriangle(
    ctx: CanvasRenderingContext2D,
    sx0: number,
    sy0: number,
    sx1: number,
    sy1: number,
    sx2: number,
    sy2: number,
    dx0: number,
    dy0: number,
    dx1: number,
    dy1: number,
    dx2: number,
    dy2: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0, dy0);
    ctx.lineTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.clip();

    const [a, b, c, d, e, f] = affineFromTriangles(
      sx0,
      sy0,
      sx1,
      sy1,
      sx2,
      sy2,
      dx0,
      dy0,
      dx1,
      dy1,
      dx2,
      dy2,
    );
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(this.img, 0, 0);
    ctx.restore();
  }

  // ── Transform mode ────────────────────────────────────────────────────────

  private drawTransformMode(
    ctx: CanvasRenderingContext2D,
    _cw: number,
    _ch: number,
  ): void {
    ctx.save();
    ctx.translate(_cw / 2, _ch / 2);

    const sc = this.canvasScale;
    const iw = this.imgW * sc;
    const ih = this.imgH * sc;
    const rotation = this.rotation();
    const flipH = this.flipH();
    const flipV = this.flipV();

    const rad = (rotation * Math.PI) / 180;
    ctx.rotate(-rad);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);

    // After rotation 90/270, swap width/height for centering
    const ew = rotation % 180 === 0 ? iw : ih;
    const eh = rotation % 180 === 0 ? ih : iw;

    ctx.drawImage(this.img, -ew / 2, -eh / 2, ew, eh);
    ctx.restore();
  }

  /** Returns 8 handle positions: NW N NE E SE S SW W (canvas coords). */
  private getCropHandlePositions(
    cx: number,
    cy: number,
    cRW: number,
    cRH: number,
  ): [number, number][] {
    const mx = cx + cRW / 2;
    const my = cy + cRH / 2;
    return [
      [cx, cy], // 0 NW
      [mx, cy], // 1 N
      [cx + cRW, cy], // 2 NE
      [cx + cRW, my], // 3 E
      [cx + cRW, cy + cRH], // 4 SE
      [mx, cy + cRH], // 5 S
      [cx, cy + cRH], // 6 SW
      [cx, my], // 7 W
    ];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mouse / Touch events
  // ─────────────────────────────────────────────────────────────────────────

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.imgLoaded()) return;
    e.preventDefault();
    const [mx, my] = this.canvasXY(e);
    this.startDrag(mx, my);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.imgLoaded()) return;
    const [mx, my] = this.canvasXY(e);
    this.updateDrag(mx, my);
  };

  private readonly onMouseUp = (): void => {
    this.activeHandle = -1;
  };

  private readonly onTouchStart = (e: TouchEvent): void => {
    if (!this.imgLoaded()) return;
    e.preventDefault();
    const t = e.touches[0];
    const [mx, my] = this.canvasXY(t);
    this.startDrag(mx, my);
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    if (!this.imgLoaded()) return;
    e.preventDefault();
    const t = e.touches[0];
    const [mx, my] = this.canvasXY(t);
    this.updateDrag(mx, my);
  };

  // ─────────────────────────────────────────────────────────────────────────

  private startDrag(mx: number, my: number): void {
    if (this.mode() === 'perspective') {
      this.startPerspDrag(mx, my);
    } else if (this.mode() === 'crop') {
      this.startCropDrag(mx, my);
    }
  }

  private updateDrag(mx: number, my: number): void {
    if (this.activeHandle === -1) return;
    if (this.mode() === 'perspective') {
      this.updatePerspDrag(mx, my);
    } else if (this.mode() === 'crop') {
      this.updateCropDrag(mx, my);
    }
    this.scheduleRedraw();
  }

  // ── Perspective drag ──────────────────────────────────────────────────────

  private startPerspDrag(mx: number, my: number): void {
    const pts = this.perspPts.map(([x, y]) => this.toCanvas(x, y));
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(mx - pts[i][0], my - pts[i][1]) <= HANDLE_R + 4) {
        this.activeHandle = i;
        this.dragMouseStart = { x: mx, y: my };
        this.dragPerspStart = this.perspPts.map((p) => [...p]) as [
          number,
          number,
        ][];
        return;
      }
    }
  }

  private updatePerspDrag(mx: number, my: number): void {
    const i = this.activeHandle;
    const dx = mx - this.dragMouseStart.x;
    const dy = my - this.dragMouseStart.y;
    const [ix, iy] = this.toImage(
      this.toCanvas(this.dragPerspStart[i][0], this.dragPerspStart[i][1])[0] +
        dx,
      this.toCanvas(this.dragPerspStart[i][0], this.dragPerspStart[i][1])[1] +
        dy,
    );
    this.perspPts[i] = [
      Math.max(0, Math.min(this.imgW, ix)),
      Math.max(0, Math.min(this.imgH, iy)),
    ];
    // Reset crop when perspective changes
    const { w, h } = this.getPerspOutSize();
    this.cropX = 0;
    this.cropY = 0;
    this.cropW = w;
    this.cropH = h;
  }

  // ── Crop drag ─────────────────────────────────────────────────────────────

  private startCropDrag(mx: number, my: number): void {
    const { pOffX, pOffY, pW, pH, perspW, perspH } = this.getCropDisplay();
    const cx = pOffX + (this.cropX / perspW) * pW;
    const cy = pOffY + (this.cropY / perspH) * pH;
    const cRW = (this.cropW / perspW) * pW;
    const cRH = (this.cropH / perspH) * pH;

    const handles = this.getCropHandlePositions(cx, cy, cRW, cRH);
    for (let i = 0; i < handles.length; i++) {
      if (
        Math.hypot(mx - handles[i][0], my - handles[i][1]) <=
        CROP_HANDLE_R + 4
      ) {
        this.activeHandle = i + 1; // 1-8
        this.dragMouseStart = { x: mx, y: my };
        this.dragCropStart = {
          x: this.cropX,
          y: this.cropY,
          w: this.cropW,
          h: this.cropH,
        };
        return;
      }
    }
    // Check inside rect → move
    if (mx >= cx && mx <= cx + cRW && my >= cy && my <= cy + cRH) {
      this.activeHandle = 0;
      this.dragMouseStart = { x: mx, y: my };
      this.dragCropStart = {
        x: this.cropX,
        y: this.cropY,
        w: this.cropW,
        h: this.cropH,
      };
    }
  }

  private updateCropDrag(mx: number, my: number): void {
    const { pW, pH, perspW, perspH } = this.getCropDisplay();
    const scaleX = perspW / pW;
    const scaleY = perspH / pH;
    const ddx = (mx - this.dragMouseStart.x) * scaleX;
    const ddy = (my - this.dragMouseStart.y) * scaleY;

    const h = this.activeHandle;
    let { x, y, w, h: ch } = this.dragCropStart;

    const minSize = 20 * scaleX;

    if (h === 0) {
      // Move
      x = Math.max(0, Math.min(perspW - w, x + ddx));
      y = Math.max(0, Math.min(perspH - ch, y + ddy));
    } else {
      // For left/top handles the opposite edge is FIXED, so w/ch are derived
      // from the new x/y rather than computed independently from ddx/ddy.
      switch (h) {
        case 1: {
          // NW – fix right edge and bottom edge
          const nx = Math.max(0, Math.min(x + w - minSize, x + ddx));
          const ny = Math.max(0, Math.min(y + ch - minSize, y + ddy));
          w = x + w - nx;
          ch = y + ch - ny;
          x = nx;
          y = ny;
          break;
        }
        case 2: {
          // N – fix bottom edge
          const ny = Math.max(0, Math.min(y + ch - minSize, y + ddy));
          ch = y + ch - ny;
          y = ny;
          break;
        }
        case 3: {
          // NE – fix left edge and bottom edge
          const ny = Math.max(0, Math.min(y + ch - minSize, y + ddy));
          ch = y + ch - ny;
          y = ny;
          w = Math.max(minSize, Math.min(perspW - x, w + ddx));
          break;
        }
        case 4: {
          // E
          w = Math.max(minSize, Math.min(perspW - x, w + ddx));
          break;
        }
        case 5: {
          // SE
          w = Math.max(minSize, Math.min(perspW - x, w + ddx));
          ch = Math.max(minSize, Math.min(perspH - y, ch + ddy));
          break;
        }
        case 6: {
          // S
          ch = Math.max(minSize, Math.min(perspH - y, ch + ddy));
          break;
        }
        case 7: {
          // SW – fix right edge
          const nx = Math.max(0, Math.min(x + w - minSize, x + ddx));
          w = x + w - nx;
          x = nx;
          ch = Math.max(minSize, Math.min(perspH - y, ch + ddy));
          break;
        }
        case 8: {
          // W – fix right edge
          const nx = Math.max(0, Math.min(x + w - minSize, x + ddx));
          w = x + w - nx;
          x = nx;
          break;
        }
      }
      // Final safety clamp
      w = Math.max(minSize, Math.min(perspW - x, w));
      ch = Math.max(minSize, Math.min(perspH - y, ch));
    }

    this.cropX = x;
    this.cropY = y;
    this.cropW = w;
    this.cropH = ch;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI callbacks
  // ─────────────────────────────────────────────────────────────────────────

  protected setMode(m: EditorMode): void {
    this.mode.set(m);
    if (m === 'crop') {
      // Sync crop to persp output size if it was never cropped
      const { w, h } = this.getPerspOutSize();
      if (this.cropW === this.imgW && this.cropH === this.imgH) {
        this.cropW = w;
        this.cropH = h;
        this.cropX = 0;
        this.cropY = 0;
      }
    }
    this.onResize();
  }

  protected rotateCW(): void {
    this.rotation.set(((this.rotation() + 90) % 360) as 0 | 90 | 180 | 270);
    this.scheduleRedraw();
  }
  protected rotateCCW(): void {
    this.rotation.set(((this.rotation() + 270) % 360) as 0 | 90 | 180 | 270);
    this.scheduleRedraw();
  }
  protected toggleFlipH(): void {
    this.flipH.update((value) => !value);
    this.scheduleRedraw();
  }
  protected toggleFlipV(): void {
    this.flipV.update((value) => !value);
    this.scheduleRedraw();
  }

  protected reset(): void {
    if (this.imgLoaded()) {
      this.resetParams();
      this.onResize();
    }
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected apply(): void {
    if (!this.imgLoaded()) return;

    const [tl, tr, br, bl] = this.perspPts as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];
    const origRect: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ] = [
      [0, 0],
      [this.imgW, 0],
      [this.imgW, this.imgH],
      [0, this.imgH],
    ];

    // Perspective: null if handles are at image corners (identity)
    const isIdentityPersp =
      dist(tl, origRect[0]) < 1 &&
      dist(tr, origRect[1]) < 1 &&
      dist(br, origRect[2]) < 1 &&
      dist(bl, origRect[3]) < 1;

    const { w: perspW, h: perspH } = this.getPerspOutSize();

    // Crop: null if full image
    const isFullCrop =
      this.cropX < 1 &&
      this.cropY < 1 &&
      Math.abs(this.cropW - perspW) < 1 &&
      Math.abs(this.cropH - perspH) < 1;

    const params: ImageEditParams = {
      perspective: isIdentityPersp
        ? null
        : ([[...tl], [...tr], [...br], [...bl]] as [
            [number, number],
            [number, number],
            [number, number],
            [number, number],
          ]),
      crop: isFullCrop
        ? null
        : {
            x: Math.round(this.cropX),
            y: Math.round(this.cropY),
            w: Math.round(this.cropW),
            h: Math.round(this.cropH),
          },
      rotation: this.rotation(),
      flipH: this.flipH(),
      flipV: this.flipV(),
    };

    this.confirmed.emit({ params, previewDataUrl: this.getPreviewDataUrl() });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Preview rendering
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Renders the full transform pipeline (perspective → crop → rotation/flip)
   * on off-screen canvases and returns a JPEG data-URL for use as a preview.
   */
  private getPreviewDataUrl(): string {
    const [tl, tr, br, bl] = this.perspPts as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];
    const { w: perspW, h: perspH } = this.getPerspOutSize();

    // Step 1 – perspective-corrected output via homography-based triangle mesh
    const perspC = document.createElement('canvas');
    perspC.width = Math.round(perspW);
    perspC.height = Math.round(perspH);
    const pCtx = perspC.getContext('2d')!;

    const H = buildHomography(tl, tr, br, bl, perspW, perspH);
    for (let row = 0; row < GRID_N; row++) {
      for (let col = 0; col < GRID_N; col++) {
        const u0 = col / GRID_N,
          u1 = (col + 1) / GRID_N;
        const v0 = row / GRID_N,
          v1 = (row + 1) / GRID_N;
        const [sx00, sy00] = applyH(H, u0 * perspW, v0 * perspH);
        const [sx10, sy10] = applyH(H, u1 * perspW, v0 * perspH);
        const [sx01, sy01] = applyH(H, u0 * perspW, v1 * perspH);
        const [sx11, sy11] = applyH(H, u1 * perspW, v1 * perspH);
        const dx0 = u0 * perspC.width,
          dx1 = u1 * perspC.width;
        const dy0 = v0 * perspC.height,
          dy1 = v1 * perspC.height;
        this.drawTriangle(
          pCtx,
          sx00,
          sy00,
          sx10,
          sy10,
          sx01,
          sy01,
          dx0,
          dy0,
          dx1,
          dy0,
          dx0,
          dy1,
        );
        this.drawTriangle(
          pCtx,
          sx10,
          sy10,
          sx11,
          sy11,
          sx01,
          sy01,
          dx1,
          dy0,
          dx1,
          dy1,
          dx0,
          dy1,
        );
      }
    }

    // Step 2 – crop
    const cx = Math.round(this.cropX),
      cy = Math.round(this.cropY);
    const cw = Math.round(this.cropW),
      ch = Math.round(this.cropH);
    const cropC = document.createElement('canvas');
    cropC.width = cw;
    cropC.height = ch;
    cropC.getContext('2d')!.drawImage(perspC, cx, cy, cw, ch, 0, 0, cw, ch);

    // Step 3 – rotation + flip  (matches Pillow's CCW convention)
    const rot = this.rotation();
    const outW = rot % 180 === 0 ? cw : ch;
    const outH = rot % 180 === 0 ? ch : cw;
    const finalC = document.createElement('canvas');
    finalC.width = outW;
    finalC.height = outH;
    const fCtx = finalC.getContext('2d')!;
    fCtx.translate(outW / 2, outH / 2);
    fCtx.rotate(-((rot * Math.PI) / 180));
    if (this.flipH()) fCtx.scale(-1, 1);
    if (this.flipV()) fCtx.scale(1, -1);
    fCtx.drawImage(cropC, -cw / 2, -ch / 2);

    return finalC.toDataURL('image/jpeg', 0.85);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Template helpers
  // ─────────────────────────────────────────────────────────────────────────

  protected readonly rotationLabel = computed(() => `${this.rotation()}°`);
}
