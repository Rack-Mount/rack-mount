import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BASE_PATH, Configuration } from '../../../../../core/api/v1';
import { PortTypeEnum } from '../../../../../core/api/v1/model/portTypeEnum';
import { PortSuggestion } from './port-suggestion.model';

@Injectable({ providedIn: 'root' })
export class PortAnalyzerService {
  private readonly http = inject(HttpClient);
  private readonly LEARN_PREFIX = 'pm_learned_';

  private readonly basePath: string = (() => {
    const configuration = inject(Configuration, { optional: true });
    const base = inject(BASE_PATH, { optional: true }) as
      | string
      | string[]
      | null;
    const first = Array.isArray(base) ? base[0] : base;
    return configuration?.basePath ?? first ?? 'http://localhost';
  })();

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Detect ports in the given image by calling the backend.
   * Falls back to showing only the learned (localStorage) annotations
   * when the backend is unreachable.
   */
  async analyzeImage(
    imageUrl: string,
    side: 'front' | 'rear',
  ): Promise<PortSuggestion[]> {
    const imagePath = this.extractImagePath(imageUrl);
    let detected: PortSuggestion[] = [];

    try {
      const raw = await firstValueFrom(
        this.http.post<
          Array<{
            port_type: PortTypeEnum;
            pos_x: number;
            pos_y: number;
            name: string;
            confidence: number;
          }>
        >(`${this.basePath}/asset/port-analyze`, {
          image_path: imagePath,
          side,
        }),
      );
      detected = (raw ?? []).map((p, i) => ({
        id: `sugg-${Date.now()}-${i}`,
        port_type: p.port_type,
        side,
        name: p.name,
        pos_x: p.pos_x,
        pos_y: p.pos_y,
        confidence: p.confidence,
        accepted: true,
      }));
    } catch {
      // Backend unavailable – only learned annotations will be shown
    }

    const learned = this.loadLearned(imageUrl, side);
    return this.mergeLearned(detected, learned, side);
  }

  /**
   * Analyze a single click position: crops the image around the click,
   * runs YOLO + OCR on the backend and returns the detected port info.
   */
  async analyzeClick(
    imageUrl: string,
    side: 'front' | 'rear',
    posX: number,
    posY: number,
  ): Promise<{
    is_port: boolean;
    port_type: PortTypeEnum;
    name: string | null;
    confidence: number;
  }> {
    const imagePath = this.extractImagePath(imageUrl);
    return firstValueFrom(
      this.http.post<{
        is_port: boolean;
        port_type: PortTypeEnum;
        name: string | null;
        confidence: number;
      }>(`${this.basePath}/asset/port-click-analyze`, {
        image_path: imagePath,
        side,
        click_x: posX,
        click_y: posY,
      }),
    );
  }

  /**
   * Persist a confirmed port annotation in localStorage and send it to
   * the backend (fire-and-forget) so that YOLO can learn from it.
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

    // Fire-and-forget: send all annotations for this image to the backend
    this.sendAnnotations(imageUrl, side).catch(() => {});
  }

  /**
   * Reports a manual correction (predicted_type → actual_type) to the backend
   * so it can update the training data and eventually retrain the model.
   * Fire-and-forget: errors are silently ignored.
   */
  reportCorrection(
    imageUrl: string,
    side: 'front' | 'rear',
    posX: number,
    posY: number,
    predictedType: PortTypeEnum,
    actualType: PortTypeEnum,
  ): void {
    const imagePath = this.extractImagePath(imageUrl);
    this.http
      .post(`${this.basePath}/asset/port-correction`, {
        image_path: imagePath,
        side,
        pos_x: posX,
        pos_y: posY,
        predicted_type: predictedType,
        actual_type: actualType,
      })
      .subscribe({ error: () => {} });
  }

  /**
   * Removes all learned annotations for the given image/side from localStorage.
   * Call this after bulk-confirming suggestions so they don't re-appear on the
   * next analysis run.
   */
  clearLearned(imageUrl: string, side: 'front' | 'rear'): void {
    try {
      localStorage.removeItem(this.learnKey(imageUrl, side));
    } catch {
      /* localStorage unavailable */
    }
  }

  /**
   * Removes a previously learned annotation for the given image/side.
   * Called when the user deletes a port marker.
   */
  removeAnnotation(
    imageUrl: string,
    side: 'front' | 'rear',
    pos_x: number,
    pos_y: number,
  ): void {
    try {
      const key = this.learnKey(imageUrl, side);
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
        pos_x: number;
        pos_y: number;
      }>;
      const updated = existing.filter(
        (a) =>
          !(Math.abs(a.pos_x - pos_x) < 3 && Math.abs(a.pos_y - pos_y) < 3),
      );
      localStorage.setItem(key, JSON.stringify(updated));
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

  private async sendAnnotations(
    imageUrl: string,
    side: 'front' | 'rear',
  ): Promise<void> {
    const annotations = this.loadLearned(imageUrl, side);
    if (!annotations.length) return;
    const imagePath = this.extractImagePath(imageUrl);
    await firstValueFrom(
      this.http.post(`${this.basePath}/asset/port-annotate`, {
        image_path: imagePath,
        side,
        annotations,
      }),
    );
  }

  /**
   * Strip the server origin and the leading "/files/" segment from a full
   * image URL so the backend receives only the media-relative path.
   *
   * e.g. "http://127.0.0.1:8000/files/components/sw.jpg"
   *   -> "components/sw.jpg"
   */
  private extractImagePath(imageUrl: string): string {
    try {
      const pathname = new URL(imageUrl).pathname;
      return pathname.replace(/^\/files\//, '');
    } catch {
      return imageUrl.replace(/^.*\/files\//, '');
    }
  }
}
