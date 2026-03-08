import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import { firstValueFrom } from 'rxjs';
import { PortTypeEnum } from '../../../../../core/api/v1/model/portTypeEnum';
import { PortSuggestion } from './port-suggestion.model';

interface Peak {
  pos: number;
  score: number;
  radius: number;
}

interface Candidate {
  /** Center X as fraction of image width (0–1). */
  cx: number;
  /** Center Y as fraction of image height (0–1). */
  cy: number;
  score: number;
  /** Estimated port aspect ratio (width / height). */
  aspectRatio: number;
}

@Injectable({ providedIn: 'root' })
export class PortAnalyzerService {
  private readonly http = inject(HttpClient);
  private tfReady = false;
  private readonly LEARN_PREFIX = 'pm_learned_';

  // ── CNN trainer constants ──────────────────────────────────────────────────
  private readonly PATCHES_KEY = 'pm_train_patches_v1';
  private readonly MODEL_KEY = 'indexeddb://pm-port-scorer-v1';
  private readonly PATCH_SIZE = 24;
  private readonly MIN_POSITIVES_TO_TRAIN = 5;
  private readonly MAX_PATCHES = 250;

  /** Loaded trained scorer model (null = not yet trained). */
  private scorer: tf.LayersModel | null = null;
  private scorerLoaded = false;
  private isTraining = false;

  // ── Public API ─────────────────────────────────────────────────────────────

  async analyzeImage(
    imageUrl: string,
    side: 'front' | 'rear',
  ): Promise<PortSuggestion[]> {
    if (!this.tfReady) {
      await tf.ready();
      this.tfReady = true;
    }

    // Load scorer from IndexedDB (noop if already loaded or not trained yet)
    await this.ensureScorerLoaded();

    // Fetch and decode via HttpClient (carries auth cookies/tokens, avoids
    // canvas taint from cross-origin img elements).
    const blobUrl = await this.fetchAsBlobUrl(imageUrl);
    try {
      const img = await this.loadImage(blobUrl);
      const {
        suggestions: detected,
        grayArr,
        W,
        H,
      } = await this.runDetection(img, side);
      const learned = this.loadLearned(imageUrl, side);
      // Fire-and-forget: collect patches and retrain if enough data
      this.collectAndMaybeTrain(grayArr, W, H, learned).catch(() => {});
      return this.mergeLearned(detected, learned, side);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  /**
   * Stores a confirmed port annotation for this image so that future
   * analyzeImage() calls return it as a high-confidence suggestion.
   */
  learnFromAnnotation(
    imageUrl: string,
    side: 'front' | 'rear',
    annotation: {
      name: string;
      port_type: PortTypeEnum;
      pos_x: number;
      pos_y: number;
    },
  ): void {
    try {
      const key = this.learnKey(imageUrl, side);
      const existing: (typeof annotation)[] = JSON.parse(
        localStorage.getItem(key) ?? '[]',
      );
      // Replace any annotation within 3 % proximity (re-add or move)
      const filtered = existing.filter(
        (a) =>
          !(
            Math.abs(a.pos_x - annotation.pos_x) < 3 &&
            Math.abs(a.pos_y - annotation.pos_y) < 3
          ),
      );
      filtered.push(annotation);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch {
      /* localStorage unavailable – silently ignore */
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private learnKey(imageUrl: string, side: 'front' | 'rear'): string {
    try {
      return this.LEARN_PREFIX + btoa(imageUrl).slice(0, 60) + '|' + side;
    } catch {
      return this.LEARN_PREFIX + imageUrl.slice(-60) + '|' + side;
    }
  }

  private loadLearned(
    imageUrl: string,
    side: 'front' | 'rear',
  ): Array<{
    name: string;
    port_type: PortTypeEnum;
    pos_x: number;
    pos_y: number;
  }> {
    try {
      return JSON.parse(
        localStorage.getItem(this.learnKey(imageUrl, side)) ?? '[]',
      );
    } catch {
      return [];
    }
  }

  private mergeLearned(
    detected: PortSuggestion[],
    learned: Array<{
      name: string;
      port_type: PortTypeEnum;
      pos_x: number;
      pos_y: number;
    }>,
    side: 'front' | 'rear',
  ): PortSuggestion[] {
    if (!learned.length) return detected;
    // Remove detected suggestions that overlap with a learned annotation
    const filtered = detected.filter(
      (d) =>
        !learned.some(
          (l) =>
            Math.abs(l.pos_x - d.pos_x) < 4 && Math.abs(l.pos_y - d.pos_y) < 4,
        ),
    );
    const learnedSugg: PortSuggestion[] = learned.map((l, i) => ({
      id: `learned-${Date.now()}-${i}`,
      port_type: l.port_type,
      side,
      name: l.name,
      pos_x: l.pos_x,
      pos_y: l.pos_y,
      confidence: 0.99,
      accepted: true,
    }));
    return [...learnedSugg, ...filtered];
  }

  private async fetchAsBlobUrl(url: string): Promise<string> {
    const blob = await firstValueFrom(
      this.http.get(url, { responseType: 'blob' }),
    );
    return URL.createObjectURL(blob);
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  // ── Detection pipeline ─────────────────────────────────────────────────────

  private async runDetection(
    img: HTMLImageElement,
    side: 'front' | 'rear',
  ): Promise<{
    suggestions: PortSuggestion[];
    grayArr: Float32Array;
    W: number;
    H: number;
  }> {
    // Draw to an off-screen canvas (scaled to max 640 px wide) so
    // tf.browser.fromPixels can access pixel data without CORS issues.
    const MAX_W = 640;
    const MAX_H = 480;
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    const scale = Math.min(1, MAX_W / origW, MAX_H / origH);
    const cW = Math.max(4, Math.round(origW * scale));
    const cH = Math.max(4, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cW;
    canvas.height = cH;
    const ctx = canvas.getContext('2d');
    if (!ctx)
      return { suggestions: [], grayArr: new Float32Array(0), W: cW, H: cH };
    ctx.drawImage(img, 0, 0, cW, cH);

    const tensors: tf.Tensor[] = [];
    const track = <T extends tf.Tensor>(x: T): T => {
      tensors.push(x);
      return x;
    };

    try {
      // ── 1. RGB → normalised float [cH, cW, 3] ──────────────────────────────
      const rgbRaw = track(tf.browser.fromPixels(canvas)) as tf.Tensor3D;
      const rgbF = track(rgbRaw.toFloat().div(255)) as tf.Tensor3D;

      // ── 2. Grayscale [cH, cW] ──────────────────────────────────────────────
      const wts = track(
        tf.tensor([0.299, 0.587, 0.114]).reshape([1, 1, 3]),
      ) as tf.Tensor3D;
      const gray2d = track(rgbF.mul(wts).sum(-1)) as tf.Tensor2D;

      // ── 3. Gaussian blur [cH, cW] ──────────────────────────────────────────
      const gkArr = [1, 2, 1, 2, 4, 2, 1, 2, 1].map((v) => v / 16);
      const gk = track(tf.tensor(gkArr).reshape([3, 3, 1, 1])) as tf.Tensor4D;
      const gray4d = track(gray2d.reshape([1, cH, cW, 1])) as tf.Tensor4D;
      const blurred2d = track(
        tf.depthwiseConv2d(gray4d, gk, 1, 'same').reshape([cH, cW]),
      ) as tf.Tensor2D;

      // ── 4. Sobel edge magnitude [cH, cW] ───────────────────────────────────
      const kxArr = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const kyArr = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
      const kx = track(tf.tensor(kxArr).reshape([3, 3, 1, 1])) as tf.Tensor4D;
      const ky = track(tf.tensor(kyArr).reshape([3, 3, 1, 1])) as tf.Tensor4D;
      const b4d = track(blurred2d.reshape([1, cH, cW, 1])) as tf.Tensor4D;
      const Gx = track(
        tf.depthwiseConv2d(b4d, kx, 1, 'same').reshape([cH, cW]),
      ) as tf.Tensor2D;
      const Gy = track(
        tf.depthwiseConv2d(b4d, ky, 1, 'same').reshape([cH, cW]),
      ) as tf.Tensor2D;
      const edgeMag = track(
        tf.sqrt(tf.add(tf.square(Gx), tf.square(Gy))),
      ) as tf.Tensor2D;

      // Normalise edges to [0, 1]
      const edgeMaxVal = (await edgeMag.max().data())[0];
      const edgesNorm = track(edgeMag.div(edgeMaxVal + 1e-6)) as tf.Tensor2D;

      // ── 5. Darkness map: how much darker than local background ─────────────
      const localMean2d = track(
        tf
          .avgPool(
            blurred2d.reshape([1, cH, cW, 1]) as tf.Tensor4D,
            15,
            1,
            'same',
          )
          .reshape([cH, cW]),
      ) as tf.Tensor2D;
      const darkRaw = track(
        tf.maximum(tf.scalar(0), tf.sub(localMean2d, blurred2d)),
      ) as tf.Tensor2D;
      const darkNorm = track(darkRaw.div(localMean2d.add(0.05))) as tf.Tensor2D;

      // ── 6. Edge density in local 9×9 window ────────────────────────────────
      const edgeDens = track(
        tf
          .avgPool(
            edgesNorm.reshape([1, cH, cW, 1]) as tf.Tensor4D,
            9,
            1,
            'same',
          )
          .reshape([cH, cW]),
      ) as tf.Tensor2D;

      // ── 7. Combined score ──────────────────────────────────────────────────
      const scoreMap = track(
        tf.add(edgeDens.mul(0.55), darkNorm.mul(0.45)),
      ) as tf.Tensor2D;

      // ── 8. Extract data to JS ──────────────────────────────────────────────
      const scoreArr = (await scoreMap.data()) as Float32Array;
      const grayArr = (await gray2d.data()) as Float32Array;

      // ── 9. Detect candidate regions ────────────────────────────────────────
      const rawCandidates = this.detectCandidates(scoreArr, grayArr, cW, cH);

      // ── 10. CNN rescore (if a trained model is available) ──────────────────
      const candidates = await this.rescoreWithCNN(
        rawCandidates,
        grayArr,
        cW,
        cH,
      );

      // ── 11. Convert to PortSuggestion[] ───────────────────────────────────
      const suggestions = this.candidatesToSuggestions(candidates, side);
      return { suggestions, grayArr, W: cW, H: cH };
    } finally {
      tensors.forEach((t) => {
        try {
          t.dispose();
        } catch {
          /* ignore */
        }
      });
    }
  }

  // ── Candidate detection (projection + peak analysis) ──────────────────────

  private detectCandidates(
    score: Float32Array,
    _gray: Float32Array,
    W: number,
    H: number,
  ): Candidate[] {
    // Row projection: average score per row
    const rowProj = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 0; x < W; x++) s += score[y * W + x];
      rowProj[y] = s / W;
    }

    // Smooth projections
    const smoothRow = this.smooth1D(rowProj, 7);
    const rowMean = smoothRow.reduce((a, b) => a + b, 0) / smoothRow.length;

    // Minimum spacing between row peaks: at least 3% of height
    const rowMinSpacing = Math.max(3, H * 0.03);
    const rowThreshold = Math.max(rowMean * 1.2, 0.04);
    const rowPeaks = this.findPeaks(smoothRow, rowThreshold, rowMinSpacing);

    // Fallback: if no row peaks found use the middle band
    if (rowPeaks.length === 0) {
      const mid = Math.round(H / 2);
      rowPeaks.push({ pos: mid, score: rowMean, radius: H * 0.2 });
    }

    const candidates: Candidate[] = [];

    for (const rp of rowPeaks) {
      const y0 = Math.max(0, Math.round(rp.pos - rp.radius));
      const y1 = Math.min(H - 1, Math.round(rp.pos + rp.radius));

      // Column profile within this row band
      const localCol = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let y = y0; y <= y1; y++) s += score[y * W + x];
        localCol[x] = s / (y1 - y0 + 1);
      }

      const smoothCol = this.smooth1D(localCol, 5);
      const colMean = smoothCol.reduce((a, b) => a + b, 0) / W;
      const colMinSpacing = Math.max(3, W * 0.015);
      const colThreshold = Math.max(colMean * 1.1, 0.03);
      const colPeaks = this.findPeaks(smoothCol, colThreshold, colMinSpacing);

      for (const cp of colPeaks) {
        const portW = cp.radius * 2;
        const portH = rp.radius * 2;
        const aspectRatio = portW / Math.max(portH, 1);

        candidates.push({
          cx: cp.pos / W,
          cy: rp.pos / H,
          score: (cp.score + rp.score) / 2,
          aspectRatio,
        });
      }
    }

    // Sort descending by score, then NMS
    candidates.sort((a, b) => b.score - a.score);
    return this.nms(candidates, 0.04);
  }

  // ── 1-D signal processing helpers ─────────────────────────────────────────

  private smooth1D(arr: Float32Array, radius: number): Float32Array {
    const r = Math.max(1, Math.round(radius));
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let s = 0;
      let cnt = 0;
      for (let d = -r; d <= r; d++) {
        const j = i + d;
        if (j >= 0 && j < arr.length) {
          s += arr[j];
          cnt++;
        }
      }
      out[i] = cnt > 0 ? s / cnt : 0;
    }
    return out;
  }

  private findPeaks(
    arr: Float32Array,
    threshold: number,
    minSpacing: number,
  ): Peak[] {
    const win = Math.max(2, Math.round(minSpacing / 3));
    const peaks: Peak[] = [];

    for (let i = win; i < arr.length - win; i++) {
      if (arr[i] <= threshold) continue;

      // Check local maximum within neighbourhood window
      let isMax = true;
      for (let d = -win; d <= win; d++) {
        if (d !== 0 && arr[i + d] > arr[i]) {
          isMax = false;
          break;
        }
      }
      if (!isMax) continue;

      // Enforce minimum spacing from the previous accepted peak
      if (peaks.length > 0 && i - peaks[peaks.length - 1].pos < minSpacing) {
        if (arr[i] > peaks[peaks.length - 1].score) {
          peaks[peaks.length - 1] = {
            pos: i,
            score: arr[i],
            radius: this.halfWidth(arr, i),
          };
        }
        continue;
      }

      peaks.push({ pos: i, score: arr[i], radius: this.halfWidth(arr, i) });
    }

    return peaks;
  }

  /** Estimates the half-width of a peak at half its maximum value. */
  private halfWidth(arr: Float32Array, peakPos: number): number {
    const half = arr[peakPos] * 0.5;
    let left = peakPos;
    let right = peakPos;
    while (left > 0 && arr[left - 1] >= half) left--;
    while (right < arr.length - 1 && arr[right + 1] >= half) right++;
    return Math.max(2, (right - left) * 0.5);
  }

  /** Non-maximum suppression: removes candidates closer than `minDist` (0–1 fraction). */
  private nms(sorted: Candidate[], minDist: number): Candidate[] {
    const kept: Candidate[] = [];
    for (const c of sorted) {
      const overlap = kept.some((k) => {
        const dx = c.cx - k.cx;
        const dy = c.cy - k.cy;
        return Math.sqrt(dx * dx + dy * dy) < minDist;
      });
      if (!overlap) {
        kept.push(c);
        if (kept.length >= 48) break;
      }
    }
    return kept;
  }

  // ── Candidate → PortSuggestion ─────────────────────────────────────────────

  private candidatesToSuggestions(
    candidates: Candidate[],
    side: 'front' | 'rear',
  ): PortSuggestion[] {
    // Group by approximate Y to count port-rows and assign names per row
    const SAME_ROW_THRESHOLD = 0.08; // within 8% height → same row
    const rows: Candidate[][] = [];

    for (const c of candidates) {
      const row = rows.find(
        (r) => Math.abs(r[0].cy - c.cy) < SAME_ROW_THRESHOLD,
      );
      if (row) {
        row.push(c);
      } else {
        rows.push([c]);
      }
    }

    // Sort rows top-to-bottom, ports left-to-right within each row
    rows.sort((a, b) => a[0].cy - b[0].cy);
    rows.forEach((r) => r.sort((a, b) => a.cx - b.cx));

    const suggestions: PortSuggestion[] = [];
    let globalIdx = 0;

    for (const row of rows) {
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const c = row[colIdx];
        const portType = this.classifyPortType(c.aspectRatio);
        const name = this.generatePortName(portType, globalIdx);
        suggestions.push({
          id: `sugg-${Date.now()}-${globalIdx}`,
          port_type: portType,
          side,
          name,
          pos_x: parseFloat((c.cx * 100).toFixed(1)),
          pos_y: parseFloat((c.cy * 100).toFixed(1)),
          confidence: parseFloat(Math.min(1, c.score * 2.2).toFixed(2)),
          accepted: c.score >= 0.25,
        });
        globalIdx++;
      }
    }

    return suggestions;
  }

  /**
   * Classifies a detected region's port type based on aspect ratio (width/height).
   *
   * Reference aspect ratios (approximate):
   *   RJ45    ≈ 1.6–2.0   (wide rectangle, tab-less profile)
   *   SFP/SFP+ ≈ 0.9–1.4  (near-square, tall cage)
   *   USB-A   ≈ 2.0–3.0   (wide, flat)
   *   SERIAL  ≈ 3.0+      (very wide DE-9/DB-25)
   *   VGA/HDMI ≈ 1.4–1.8  (medium rectangle)
   */
  private classifyPortType(ar: number): PortTypeEnum {
    if (ar >= 2.8) return 'SERIAL' as PortTypeEnum;
    if (ar >= 1.9 && ar < 2.8) return 'USB-A' as PortTypeEnum;
    if (ar >= 1.4 && ar < 1.9) return 'RJ45' as PortTypeEnum;
    if (ar >= 0.8 && ar < 1.4) return 'SFP' as PortTypeEnum;
    if (ar < 0.8) return 'LC' as PortTypeEnum;
    return 'OTHER' as PortTypeEnum;
  }

  private generatePortName(type: PortTypeEnum, index: number): string {
    switch (type) {
      case 'RJ45':
        return `GigabitEthernet0/${index}`;
      case 'SFP':
      case 'SFP+':
      case 'SFP28':
        return `TenGigabitEthernet0/${index}`;
      case 'USB-A':
      case 'USB-C':
        return `USB${index + 1}`;
      case 'SERIAL':
        return `Serial0/${index}`;
      case 'MGMT':
        return `Management${index + 1}`;
      case 'HDMI':
        return `HDMI${index + 1}`;
      case 'VGA':
        return `VGA${index + 1}`;
      default:
        return `Port${index + 1}`;
    }
  }

  // ── CNN scorer: architecture ───────────────────────────────────────────────

  /**
   * Builds a small binary CNN:
   *   Input  [24, 24, 1] – grayscale patch
   *   Output [1]         – probability that the patch contains a port
   */
  private buildScorer(): tf.LayersModel {
    const m = tf.sequential();
    m.add(
      tf.layers.conv2d({
        inputShape: [this.PATCH_SIZE, this.PATCH_SIZE, 1],
        filters: 8,
        kernelSize: 3,
        padding: 'same',
        activation: 'relu',
      }),
    );
    m.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
    m.add(
      tf.layers.conv2d({
        filters: 16,
        kernelSize: 3,
        padding: 'same',
        activation: 'relu',
      }),
    );
    m.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
    m.add(tf.layers.flatten());
    m.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    m.add(tf.layers.dropout({ rate: 0.3 }));
    m.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    m.compile({ optimizer: tf.train.adam(0.001), loss: 'binaryCrossentropy' });
    return m;
  }

  // ── CNN scorer: persistence ────────────────────────────────────────────────

  private async ensureScorerLoaded(): Promise<void> {
    if (this.scorerLoaded) return;
    this.scorerLoaded = true; // guard against concurrent loads
    try {
      this.scorer = await tf.loadLayersModel(this.MODEL_KEY);
      // Recompile for continued training
      this.scorer.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'binaryCrossentropy',
      });
    } catch {
      this.scorer = null; // model not yet available – first run
    }
  }

  // ── CNN scorer: patch extraction ───────────────────────────────────────────

  /**
   * Extracts a PATCH_SIZE × PATCH_SIZE normalised grayscale patch from the
   * detection canvas, centred at canvas pixel (cx, cy).
   */
  private extractPatch(
    gray: Float32Array,
    W: number,
    H: number,
    cx: number,
    cy: number,
  ): number[] {
    const half = Math.floor(this.PATCH_SIZE / 2);
    const patch: number[] = [];
    for (let dy = -half; dy < this.PATCH_SIZE - half; dy++) {
      for (let dx = -half; dx < this.PATCH_SIZE - half; dx++) {
        const xi = Math.max(0, Math.min(W - 1, Math.round(cx + dx)));
        const yi = Math.max(0, Math.min(H - 1, Math.round(cy + dy)));
        patch.push(gray[yi * W + xi]);
      }
    }
    return patch;
  }

  // ── CNN scorer: training data storage ─────────────────────────────────────

  private loadPatches(): Array<{ data: number[]; label: 0 | 1 }> {
    try {
      return JSON.parse(localStorage.getItem(this.PATCHES_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  private savePatches(patches: Array<{ data: number[]; label: 0 | 1 }>): void {
    try {
      localStorage.setItem(
        this.PATCHES_KEY,
        JSON.stringify(patches.slice(-this.MAX_PATCHES)),
      );
    } catch {
      try {
        localStorage.removeItem(this.PATCHES_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  // ── CNN scorer: patch collection & training trigger ────────────────────────

  /**
   * Called fire-and-forget after each successful detection.
   * Adds labeled patches to localStorage and retrains the model when
   * enough confirmed positives have been collected (≥ MIN_POSITIVES_TO_TRAIN).
   */
  private async collectAndMaybeTrain(
    grayArr: Float32Array,
    W: number,
    H: number,
    learned: Array<{ pos_x: number; pos_y: number }>,
  ): Promise<void> {
    if (!learned.length) return;

    // Positive patches: one per confirmed annotation
    const positives = learned.map((l) => ({
      data: this.extractPatch(
        grayArr,
        W,
        H,
        (l.pos_x / 100) * W,
        (l.pos_y / 100) * H,
      ),
      label: 1 as const,
    }));

    // Negative patches: sampled from a regular grid, excluding port vicinities
    const negatives: Array<{ data: number[]; label: 0 }> = [];
    const steps = 8;
    for (let row = 1; row < steps; row++) {
      for (let col = 1; col < steps; col++) {
        const px = (col / steps) * 100;
        const py = (row / steps) * 100;
        const nearPort = learned.some(
          (l) => Math.abs(l.pos_x - px) < 8 && Math.abs(l.pos_y - py) < 8,
        );
        if (!nearPort) {
          negatives.push({
            data: this.extractPatch(
              grayArr,
              W,
              H,
              (px / 100) * W,
              (py / 100) * H,
            ),
            label: 0,
          });
        }
      }
    }

    const combined = [...this.loadPatches(), ...positives, ...negatives];
    this.savePatches(combined);

    const posCount = combined.filter((p) => p.label === 1).length;
    if (posCount >= this.MIN_POSITIVES_TO_TRAIN && !this.isTraining) {
      await this.trainScorer(combined);
    }
  }

  // ── CNN scorer: model training ─────────────────────────────────────────────

  private async trainScorer(
    patches: Array<{ data: number[]; label: 0 | 1 }>,
  ): Promise<void> {
    if (this.isTraining || patches.length < this.MIN_POSITIVES_TO_TRAIN) return;
    this.isTraining = true;

    const shuffled = [...patches].sort(() => Math.random() - 0.5);
    const N = shuffled.length;
    const flatLen = this.PATCH_SIZE * this.PATCH_SIZE;

    const xBuf = new Float32Array(N * flatLen);
    const yBuf = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = shuffled[i];
      for (let j = 0; j < flatLen; j++) {
        xBuf[i * flatLen + j] = p.data[j] ?? 0;
      }
      yBuf[i] = p.label;
    }

    const xs = tf.tensor4d(xBuf, [N, this.PATCH_SIZE, this.PATCH_SIZE, 1]);
    const ys = tf.tensor2d(yBuf, [N, 1]);

    try {
      const model = this.scorer ?? this.buildScorer();
      await model.fit(xs, ys, {
        epochs: 25,
        batchSize: 16,
        shuffle: true,
        verbose: 0,
        validationSplit: 0.1,
      });
      await model.save(this.MODEL_KEY);
      this.scorer = model;
    } finally {
      xs.dispose();
      ys.dispose();
      this.isTraining = false;
    }
  }

  // ── CNN scorer: candidate rescoring ───────────────────────────────────────

  /**
   * Rescores detection candidates using the trained CNN (if loaded).
   * The final score is a 50/50 blend of the heuristic and CNN scores
   * so the signal-processing fallback is always preserved.
   */
  private async rescoreWithCNN(
    candidates: Candidate[],
    grayArr: Float32Array,
    W: number,
    H: number,
  ): Promise<Candidate[]> {
    if (!this.scorer || !candidates.length) return candidates;

    const flatLen = this.PATCH_SIZE * this.PATCH_SIZE;
    const N = candidates.length;
    const xBuf = new Float32Array(N * flatLen);

    for (let i = 0; i < N; i++) {
      const c = candidates[i];
      const patch = this.extractPatch(grayArr, W, H, c.cx * W, c.cy * H);
      for (let j = 0; j < flatLen; j++) {
        xBuf[i * flatLen + j] = patch[j] ?? 0;
      }
    }

    const xs = tf.tensor4d(xBuf, [N, this.PATCH_SIZE, this.PATCH_SIZE, 1]);
    let cnnScores: Float32Array;
    try {
      const pred = this.scorer.predict(xs) as tf.Tensor;
      cnnScores = (await pred.data()) as Float32Array;
      pred.dispose();
    } finally {
      xs.dispose();
    }

    return candidates.map((c, i) => ({
      ...c,
      score: c.score * 0.5 + cnnScores[i] * 0.5,
    }));
  }
}
