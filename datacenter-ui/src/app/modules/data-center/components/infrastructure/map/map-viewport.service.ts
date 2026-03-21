import { computed, Injectable, OnDestroy, signal } from '@angular/core';
import { getBoundingBox, gridSnap } from './map-layout.utils';
import { MapElement } from './map.types';

/**
 * Manages viewport state (zoom, pan, grid rendering) for the floor-plan editor.
 *
 * Provided at the MapComponent level so each map instance has its own
 * independent viewport.  After injection, the host component must call
 * `init()` from its `ngAfterViewInit` to register the SVG element getter.
 */
@Injectable()
export class MapViewportService implements OnDestroy {
  // ── Viewport state ─────────────────────────────────────────────────────────
  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);

  // ── Grid path signals (screen-space SVG path data) ─────────────────────────
  readonly gridPath = signal('');
  readonly gridPathMajor = signal('');

  // ── Panning drag state ─────────────────────────────────────────────────────
  isPanning = false;
  private panDragStart: {
    screenX: number;
    screenY: number;
    panX: number;
    panY: number;
  } | null = null;

  // ── Computed ───────────────────────────────────────────────────────────────
  readonly svgTransform = computed(
    () => `translate(${this.panX()},${this.panY()}) scale(${this.zoom()})`,
  );

  // ── Internal ───────────────────────────────────────────────────────────────
  private gridRafId: number | null = null;
  private svgGetter?: () => SVGSVGElement | null;

  // ── Initialization ─────────────────────────────────────────────────────────

  /**
   * Registers the SVG element getter used by grid-update and coordinate
   * conversion methods.  Must be called from `ngAfterViewInit` of the host
   * component.
   */
  init(svgGetter: () => SVGSVGElement | null): void {
    this.svgGetter = svgGetter;
  }

  // ── Pan ────────────────────────────────────────────────────────────────────

  startPan(screenX: number, screenY: number): void {
    this.isPanning = true;
    this.panDragStart = {
      screenX,
      screenY,
      panX: this.panX(),
      panY: this.panY(),
    };
  }

  updatePan(screenX: number, screenY: number): void {
    if (!this.panDragStart) return;
    this.panX.set(
      this.panDragStart.panX + (screenX - this.panDragStart.screenX),
    );
    this.panY.set(
      this.panDragStart.panY + (screenY - this.panDragStart.screenY),
    );
    this.scheduleUpdateGrid();
  }

  endPan(): void {
    this.isPanning = false;
    this.panDragStart = null;
  }

  // ── Zoom ───────────────────────────────────────────────────────────────────

  zoomIn(): void {
    const svg = this.svgGetter?.();
    if (svg) this.applyZoom(1.25, svg);
  }

  zoomOut(): void {
    const svg = this.svgGetter?.();
    if (svg) this.applyZoom(1 / 1.25, svg);
  }

  resetZoom(): void {
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  applyZoom(
    factor: number,
    svgElement: SVGSVGElement,
    pivotX?: number,
    pivotY?: number,
  ): void {
    const cx = pivotX ?? svgElement.clientWidth / 2;
    const cy = pivotY ?? svgElement.clientHeight / 2;
    const currentZoom = this.zoom();
    const newZoom = Math.min(20, Math.max(0.1, currentZoom * factor));
    this.panX.set(cx - (cx - this.panX()) * (newZoom / currentZoom));
    this.panY.set(cy - (cy - this.panY()) * (newZoom / currentZoom));
    this.zoom.set(newZoom);
  }

  fitToView(elements: MapElement[], svgElement: SVGSVGElement): void {
    const bbox = getBoundingBox(elements);
    if (!bbox) {
      this.resetZoom();
      return;
    }

    const PADDING = 60;
    const { minX, minY, maxX, maxY } = bbox;
    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    const svgW = svgElement.clientWidth;
    const svgH = svgElement.clientHeight;

    const newZoom = Math.min(
      20,
      Math.max(
        0.1,
        Math.min(
          (svgW - PADDING * 2) / contentW,
          (svgH - PADDING * 2) / contentH,
        ),
      ),
    );

    this.zoom.set(newZoom);
    this.panX.set((svgW - contentW * newZoom) / 2 - minX * newZoom);
    this.panY.set((svgH - contentH * newZoom) / 2 - minY * newZoom);
  }

  // ── Coordinate conversion ──────────────────────────────────────────────────

  /**
   * Converts a mouse event's screen coordinates to floor-plan (world)
   * coordinates, accounting for the current zoom and pan.
   * When the user holds Alt, the result is snapped to the nearest 10 cm grid.
   */
  getSvgPoint(event: MouseEvent): { x: number; y: number } {
    const svg = this.svgGetter?.();
    if (!svg) return { x: 0, y: 0 };

    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()!.inverse());

    const contentX = (svgP.x - this.panX()) / this.zoom();
    const contentY = (svgP.y - this.panY()) / this.zoom();

    if (event.altKey) {
      return { x: gridSnap(contentX), y: gridSnap(contentY) };
    }
    return { x: contentX, y: contentY };
  }

  // ── Grid ───────────────────────────────────────────────────────────────────

  /** Debounced grid update: at most once per animation frame. */
  scheduleUpdateGrid(): void {
    if (this.gridRafId !== null) return;
    this.gridRafId = requestAnimationFrame(() => {
      this.gridRafId = null;
      this.updateGrid();
    });
  }

  updateGrid(): void {
    const svg = this.svgGetter?.();
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const W = rect.width || svg.clientWidth || 1200;
    const H = rect.height || svg.clientHeight || 800;
    const z = this.zoom();
    const pX = this.panX();
    const pY = this.panY();

    // Minor grid: 10 cm
    const minor = 10 * z;
    if (minor < 2) {
      this.gridPath.set('');
      this.gridPathMajor.set('');
      return;
    }

    const offXm = ((pX % minor) + minor) % minor;
    const offYm = ((pY % minor) + minor) % minor;
    let dMinor = '';
    for (let x = offXm; x <= W + minor; x += minor)
      dMinor += `M${x},0 L${x},${H} `;
    for (let y = offYm; y <= H + minor; y += minor)
      dMinor += `M0,${y} L${W},${y} `;
    this.gridPath.set(dMinor);

    // Major grid: 60 cm
    const major = 60 * z;
    const offXM = ((pX % major) + major) % major;
    const offYM = ((pY % major) + major) % major;
    let dMajor = '';
    for (let x = offXM; x <= W + major; x += major)
      dMajor += `M${x},0 L${x},${H} `;
    for (let y = offYM; y <= H + major; y += major)
      dMajor += `M0,${y} L${W},${y} `;
    this.gridPathMajor.set(dMajor);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    if (this.gridRafId !== null) cancelAnimationFrame(this.gridRafId);
  }
}
