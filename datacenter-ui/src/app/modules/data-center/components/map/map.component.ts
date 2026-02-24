import {
  Component,
  HostListener,
  ViewChild,
  ElementRef,
  AfterViewInit,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapSidebarComponent } from '../map-sidebar/map-sidebar.component';

interface MapElement {
  id: string;
  type: 'wall' | 'rack' | 'door' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  points?: { x: number; y: number }[]; // For polylines (walls)
  text?: string;
  // Pre-computed display data (walls only, updated by updateWallDerived)
  area?: number;
  centroidX?: number;
  centroidY?: number;
  segments?: { x: number; y: number; length: number }[];
  angles?: {
    x: number;
    y: number;
    angle: number;
    labelX: number;
    labelY: number;
  }[];
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, MapSidebarComponent],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements AfterViewInit {
  constructor(private cdr: ChangeDetectorRef) {}
  selectedTool: string = 'select';

  elements: MapElement[] = [];

  isDrawing = false;
  currentElement: MapElement | null = null;
  startPoint: { x: number; y: number } | null = null;
  selectedElementId: string | null = null;

  // Polyline drawing state
  activePolylinePoints: { x: number; y: number }[] = [];
  activeWallSegments: { x: number; y: number; length: number }[] = [];
  previewAngles: {
    x: number;
    y: number;
    angle: number;
    labelX: number;
    labelY: number;
  }[] = [];
  cursorPosition: { x: number; y: number } = { x: 0, y: 0 };
  currentSegmentLength: number = 0;
  intersectionPoint: { x: number; y: number } | null = null;
  vertexSnapPoint: { x: number; y: number } | null = null;

  // Zoom & pan state
  zoom = 1;
  panX = 0;
  panY = 0;

  // Pan drag state
  isPanning = false;
  panDragStart: {
    screenX: number;
    screenY: number;
    panX: number;
    panY: number;
  } | null = null;

  get svgTransform(): string {
    return `translate(${this.panX},${this.panY}) scale(${this.zoom})`;
  }

  // Adaptive grid: base step 10cm, doubles/halves to keep visual size in 15–150px
  get gridPattern(): {
    size: number;
    offsetX: number;
    offsetY: number;
    step: number;
  } {
    let step = 10; // 10cm base
    const MIN_PX = 15;
    const MAX_PX = 150;
    while (step * this.zoom < MIN_PX) step *= 10;
    while (step * this.zoom > MAX_PX) step /= 10;
    const size = step * this.zoom;
    const offsetX = ((this.panX % size) + size) % size;
    const offsetY = ((this.panY % size) + size) % size;
    return { size, offsetX, offsetY, step };
  }

  // Pre-computed grid path string for SVG (screen-space lines), updated on zoom/pan
  gridPath = '';
  private gridRafId: number | null = null;

  // Debounced grid update: at most once per animation frame
  private scheduleUpdateGrid(): void {
    if (this.gridRafId !== null) return;
    this.gridRafId = requestAnimationFrame(() => {
      this.gridRafId = null;
      this.updateGrid();
    });
  }

  private updateGrid(): void {
    const svg = this.svgContainer?.nativeElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const W = rect.width || svg.clientWidth || 1200;
    const H = rect.height || svg.clientHeight || 800;
    const size = 40; // fixed screen-space size, independent of zoom
    const offsetX = ((this.panX % size) + size) % size;
    const offsetY = ((this.panY % size) + size) % size;
    let d = '';
    for (let x = offsetX; x <= W + size; x += size) {
      d += `M${x},0 L${x},${H} `;
    }
    for (let y = offsetY; y <= H + size; y += size) {
      d += `M0,${y} L${W},${y} `;
    }
    this.gridPath = d;
    this.cdr.markForCheck();
  }

  @ViewChild('svgContainer') svgContainer!: ElementRef<SVGSVGElement>;

  ngAfterViewInit(): void {
    // Must use passive:false to call preventDefault() on wheel
    this.svgContainer.nativeElement.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        this.applyZoom(factor, e.offsetX, e.offsetY);
      },
      { passive: false },
    );

    // Prevent browser middle-click autoscroll cursor
    this.svgContainer.nativeElement.addEventListener(
      'mousedown',
      (e: MouseEvent) => {
        if (e.button === 1) e.preventDefault();
      },
      { passive: false },
    );

    // Initial grid render
    setTimeout(() => this.updateGrid(), 0);

    // Update grid on window resize
    window.addEventListener('resize', () => this.scheduleUpdateGrid());
  }

  get polylinePreviewPoints(): string {
    if (this.activePolylinePoints.length === 0) return '';
    // Current confirmed points
    return this.activePolylinePoints.map((p) => `${p.x},${p.y}`).join(' ');
  }

  // Calculate distance between two points
  private getDistance(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
  ): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  // Calculate angle at vertex p2 formed by p1-p2-p3
  private getAngle(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
  ): number {
    const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
    const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    let angle = (a2 - a1) * (180 / Math.PI);

    // Normalize to 0-360
    if (angle < 0) angle += 360;

    // We usually want the inner angle, but without winding order it's ambiguous.
    // Returning the smaller angle (0-180) is often safer for generic polylines
    // or returning the raw CCW angle. Let's return the raw angle (0-360) for now.
    // Or simply the difference.
    // If we want the angle "between lines", it's usually <= 180.
    if (angle > 180) angle = 360 - angle;

    return angle;
  }

  // Get angles for all vertices in the polyline (including the cursor as the last point)
  getWallAngles(
    points: { x: number; y: number }[],
    cursor?: { x: number; y: number },
    centroidX?: number,
    centroidY?: number,
  ): { x: number; y: number; angle: number; labelX: number; labelY: number }[] {
    let fullPoints = cursor ? [...points, cursor] : [...points];

    // Check if closed loop (first point == last point)
    if (
      fullPoints.length > 2 &&
      fullPoints[0].x === fullPoints[fullPoints.length - 1].x &&
      fullPoints[0].y === fullPoints[fullPoints.length - 1].y
    ) {
      fullPoints.push(fullPoints[1]);
    }

    if (fullPoints.length < 3) return [];

    const LABEL_DIST = 18 / this.zoom;
    const result = [];
    for (let i = 1; i < fullPoints.length - 1; i++) {
      const p1 = fullPoints[i - 1];
      const p2 = fullPoints[i];
      const p3 = fullPoints[i + 1];

      const angle = this.getAngle(p1, p2, p3);

      // Compute inward bisector for label placement
      const u1x = p1.x - p2.x,
        u1y = p1.y - p2.y;
      const u2x = p3.x - p2.x,
        u2y = p3.y - p2.y;
      const l1 = Math.sqrt(u1x * u1x + u1y * u1y);
      const l2 = Math.sqrt(u2x * u2x + u2y * u2y);
      let bx = 0,
        by = 0;
      if (l1 > 0 && l2 > 0) {
        const n1x = u1x / l1,
          n1y = u1y / l1;
        const n2x = u2x / l2,
          n2y = u2y / l2;
        bx = n1x + n2x;
        by = n1y + n2y;
        const bl = Math.sqrt(bx * bx + by * by);
        if (bl < 0.001) {
          bx = -n1y;
          by = n1x;
        } // degenerate (180°): use perp
        else {
          bx /= bl;
          by /= bl;
        }
        // If centroid provided, ensure bisector points inward
        if (centroidX !== undefined && centroidY !== undefined) {
          const toCx = centroidX - p2.x,
            toCy = centroidY - p2.y;
          if (bx * toCx + by * toCy < 0) {
            bx = -bx;
            by = -by;
          }
        }
      }

      result.push({
        x: p2.x,
        y: p2.y,
        angle,
        labelX: p2.x + bx * LABEL_DIST,
        labelY: p2.y + by * LABEL_DIST,
      });
    }
    return result;
  }

  // Calculate intersection between two line segments p1-p2 and p3-p4
  private getLineIntersection(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number },
  ): { x: number; y: number } | null {
    const x1 = p1.x,
      y1 = p1.y,
      x2 = p2.x,
      y2 = p2.y;
    const x3 = p3.x,
      y3 = p3.y,
      x4 = p4.x,
      y4 = p4.y;

    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom === 0) return null; // Parallel lines

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    // Check if intersection is within the segments
    // Using a small epsilon for floating point inaccuracies
    const epsilon = 0.001;
    if (
      ua >= 0 - epsilon &&
      ua <= 1 + epsilon &&
      ub >= 0 - epsilon &&
      ub <= 1 + epsilon
    ) {
      return {
        x: x1 + ua * (x2 - x1),
        y: y1 + ua * (y2 - y1),
      };
    }
    return null;
  }

  // Check for intersections with existing walls and current polyline
  private checkIntersections(currentPoint: {
    x: number;
    y: number;
  }): { x: number; y: number } | null {
    if (this.activePolylinePoints.length === 0) return null;

    const lastPoint =
      this.activePolylinePoints[this.activePolylinePoints.length - 1];
    let closestIntersection: { x: number; y: number } | null = null;
    let minDistance = Infinity;

    // Helper to check and update closest intersection
    const checkAndSetClosest = (
      p1: { x: number; y: number },
      p2: { x: number; y: number },
    ) => {
      // Avoid intersecting with the immediate previous segment (which shares a point)
      if (
        (p1.x === lastPoint.x && p1.y === lastPoint.y) ||
        (p2.x === lastPoint.x && p2.y === lastPoint.y)
      )
        return;

      const intersection = this.getLineIntersection(
        lastPoint,
        currentPoint,
        p1,
        p2,
      );
      if (intersection) {
        const dist = this.getDistance(lastPoint, intersection);
        // We want the intersection closest to the start of the current segment (optional logic,
        // usually we care about the one closest to cursor but here we are drawing FROM lastPoint TO cursor)
        // Actually, visualizing any valid intersection is good. Let's pick the one closest to the last confirmed point
        if (dist < minDistance && dist > 1) {
          // >1 to avoid self-intersection at start vertex
          minDistance = dist;
          closestIntersection = intersection;
        }
      }
    };

    // 1. Check against existing walls in the elements array
    for (const element of this.elements) {
      if (
        element.type === 'wall' &&
        element.points &&
        element.points.length > 1
      ) {
        for (let i = 0; i < element.points.length - 1; i++) {
          checkAndSetClosest(element.points[i], element.points[i + 1]);
        }
      }
    }

    // 2. Check against segments of the currently drawn polyline (excluding the very last one we are drawing from)
    if (this.activePolylinePoints.length > 2) {
      // Need at least 2 segments to intersect a previous one
      for (let i = 0; i < this.activePolylinePoints.length - 2; i++) {
        checkAndSetClosest(
          this.activePolylinePoints[i],
          this.activePolylinePoints[i + 1],
        );
      }
    }

    return closestIntersection;
  }

  // Find the closest vertex (start or end point) of any wall
  private getClosestVertex(
    point: { x: number; y: number },
    tolerance: number,
  ): { x: number; y: number } | null {
    let closestVertex: { x: number; y: number } | null = null;
    let minDistance = tolerance;

    const checkPoint = (p: { x: number; y: number }) => {
      const dist = this.getDistance(point, p);
      if (dist < minDistance) {
        minDistance = dist;
        closestVertex = p;
      }
    };

    // Check existing walls
    for (const element of this.elements) {
      if (element.type === 'wall' && element.points) {
        for (const p of element.points) {
          checkPoint(p);
        }
      }
    }

    // Check current polyline vertices (except the very last one we are drawing from)
    if (this.activePolylinePoints.length > 0) {
      const len = this.activePolylinePoints.length;
      // We can snap to start (index 0) to close loop
      // Don't snap to the last point (index len-1)
      for (let i = 0; i < len - 1; i++) {
        checkPoint(this.activePolylinePoints[i]);
      }
    }

    return closestVertex;
  }

  // Get midpoints and lengths for wall segments
  getWallSegments(
    points: { x: number; y: number }[] | undefined,
  ): { x: number; y: number; length: number }[] {
    if (!points || points.length < 2) return [];
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const length = this.getDistance(p1, p2);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      segments.push({ x: midX, y: midY, length });
    }
    return segments;
  }

  // Pre-compute all display data onto the element so the template reads stable properties (avoids NG0100/NG0956)
  private updateWallDerived(el: MapElement): void {
    if (el.type !== 'wall' || !el.points) {
      el.segments = [];
      el.angles = [];
      el.area = undefined;
      el.centroidX = undefined;
      el.centroidY = undefined;
      return;
    }

    // Segments
    const pts = el.points;
    const segs: { x: number; y: number; length: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i],
        p2 = pts[i + 1];
      segs.push({
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        length: this.getDistance(p1, p2),
      });
    }
    el.segments = segs;

    // Area & centroid (only for closed polygons with >= 4 points)
    let computedCx: number | undefined;
    let computedCy: number | undefined;
    if (pts.length >= 4 && this.getDistance(pts[0], pts[pts.length - 1]) <= 2) {
      const poly = pts.slice(0, pts.length - 1);
      const n = poly.length;
      let sa = 0,
        cx = 0,
        cy = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const cross = poly[i].x * poly[j].y - poly[j].x * poly[i].y;
        sa += cross;
        cx += (poly[i].x + poly[j].x) * cross;
        cy += (poly[i].y + poly[j].y) * cross;
      }
      sa /= 2;
      const absArea = Math.abs(sa);
      if (absArea > 0) {
        el.area = absArea;
        computedCx = cx / (6 * sa);
        computedCy = cy / (6 * sa);
        el.centroidX = computedCx;
        el.centroidY = computedCy;
      } else {
        el.area = undefined;
        el.centroidX = undefined;
        el.centroidY = undefined;
      }
    } else {
      el.area = undefined;
      el.centroidX = undefined;
      el.centroidY = undefined;
    }

    // Angles (computed after centroid so we can pass it for inward orientation)
    el.angles = this.getWallAngles(pts, undefined, computedCx, computedCy);
  }

  // Merge two walls: elA vertex idxA is joined to elB vertex idxB
  // Both walls must be open (not closed loops) and the joined vertex must be an endpoint
  private mergeWalls(
    elA: MapElement,
    idxA: number,
    elB: MapElement,
    idxB: number,
  ): void {
    const ptsA = elA.points!;
    const ptsB = elB.points!;
    if (ptsA.length < 2 || ptsB.length < 2) return;

    // Check if walls are closed (loops)
    const closedA = this.getDistance(ptsA[0], ptsA[ptsA.length - 1]) < 2;
    const closedB = this.getDistance(ptsB[0], ptsB[ptsB.length - 1]) < 2;
    if (closedA || closedB) return; // don't merge closed polygons

    const lastA = ptsA.length - 1;
    const lastB = ptsB.length - 1;
    const aIsFirst = idxA === 0;
    const aIsLast = idxA === lastA;
    const bIsFirst = idxB === 0;
    const bIsLast = idxB === lastB;

    if (!(aIsFirst || aIsLast) || !(bIsFirst || bIsLast)) return;

    let merged: { x: number; y: number }[];

    if (aIsLast && bIsFirst) {
      // A-end → B-start: A + B
      merged = [...ptsA, ...ptsB.slice(1)];
    } else if (aIsFirst && bIsLast) {
      // A-start → B-end: B + A
      merged = [...ptsB, ...ptsA.slice(1)];
    } else if (aIsFirst && bIsFirst) {
      // A-start → B-start: reverse(A) + B
      merged = [...[...ptsA].reverse(), ...ptsB.slice(1)];
    } else if (aIsLast && bIsLast) {
      // A-end → B-end: A + reverse(B)
      merged = [...ptsA, ...[...ptsB].reverse().slice(1)];
    } else {
      return;
    }

    elA.points = merged;
    this.updateWallDerived(elA);
    this.elements = this.elements.filter((e) => e.id !== elB.id);
  }

  // Format points array to SVG points string
  getPointsString(points: { x: number; y: number }[] | undefined): string {
    if (!points || points.length === 0) return '';
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  }

  zoomIn(): void {
    this.applyZoom(1.25);
  }
  zoomOut(): void {
    this.applyZoom(1 / 1.25);
  }
  resetZoom(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.rederiveAllWalls();
  }

  fitToView(): void {
    // Collect all content points
    const xs: number[] = [];
    const ys: number[] = [];
    for (const el of this.elements) {
      if (el.points && el.points.length > 0) {
        for (const p of el.points) {
          xs.push(p.x);
          ys.push(p.y);
        }
      } else {
        xs.push(el.x, el.x + (el.width ?? 0), el.x2 ?? el.x);
        ys.push(el.y, el.y + (el.height ?? 0), el.y2 ?? el.y);
      }
    }
    if (xs.length === 0) {
      this.resetZoom();
      return;
    }

    const PADDING = 60; // px margin around content
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;

    const svg = this.svgContainer.nativeElement;
    const svgW = svg.clientWidth;
    const svgH = svg.clientHeight;

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

    // Center the bounding box in the viewport
    this.zoom = newZoom;
    this.panX = (svgW - contentW * newZoom) / 2 - minX * newZoom;
    this.panY = (svgH - contentH * newZoom) / 2 - minY * newZoom;
    this.rederiveAllWalls();
  }

  private applyZoom(factor: number, pivotX?: number, pivotY?: number): void {
    const svg = this.svgContainer.nativeElement;
    const cx = pivotX ?? svg.clientWidth / 2;
    const cy = pivotY ?? svg.clientHeight / 2;
    const newZoom = Math.min(20, Math.max(0.1, this.zoom * factor));
    this.panX = cx - (cx - this.panX) * (newZoom / this.zoom);
    this.panY = cy - (cy - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this.rederiveAllWalls();
  }

  private rederiveAllWalls(): void {
    for (const el of this.elements) {
      if (el.type === 'wall') this.updateWallDerived(el);
    }
    this.scheduleUpdateGrid();
  }

  onToolChange(toolId: string) {
    this.selectedTool = toolId;
    this.selectedElementId = null;
    this.cancelDrawing();
  }

  cancelDrawing() {
    this.isDrawing = false;
    this.currentElement = null;
    this.activePolylinePoints = [];
    this.activeWallSegments = [];
    this.previewAngles = [];
    this.currentSegmentLength = 0;
    this.intersectionPoint = null;
    this.hoveredVertex = null;
  }

  getSvgPoint(event: MouseEvent): { x: number; y: number } {
    const svg = this.svgContainer.nativeElement;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()!.inverse());

    // Unproject through inner <g> transform: translate(panX,panY) scale(zoom)
    const contentX = (svgP.x - this.panX) / this.zoom;
    const contentY = (svgP.y - this.panY) / this.zoom;

    // Grid Snap (Alt key) — 10cm = 10 SVG units
    if (event.altKey) {
      const gridSize = 10;
      return {
        x: Math.round(contentX / gridSize) * gridSize,
        y: Math.round(contentY / gridSize) * gridSize,
      };
    }

    return { x: contentX, y: contentY };
  }

  // Selected vertex for moving
  selectedVertex: { elementId: string; pointIndex: number } | null = null;
  // Hovered vertex (shown in red, can be deleted with Del)
  hoveredVertex: {
    elementId: string;
    pointIndex: number;
    x: number;
    y: number;
  } | null = null;
  // Selected whole wall for moving
  movingElementId: string | null = null;
  lastMousePosition: { x: number; y: number } | null = null;

  // Snap-to-vertex target (other wall) while dragging a vertex
  snapTargetVertex: {
    elementId: string;
    pointIndex: number;
    x: number;
    y: number;
  } | null = null;

  // Minimal distance from point p to line segment v-w
  private getDistanceToSegment(
    p: { x: number; y: number },
    v: { x: number; y: number },
    w: { x: number; y: number },
  ): number {
    const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
    if (l2 === 0) return this.getDistance(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return this.getDistance(p, projection);
  }

  onMouseDown(event: MouseEvent) {
    // Middle mouse button OR left button in select mode on empty background → pan
    const isMiddle = event.button === 1;
    const isSelectBackground =
      event.button === 0 &&
      this.selectedTool === 'select' &&
      event.target === event.currentTarget;
    if (isMiddle || isSelectBackground) {
      event.preventDefault();
      this.isPanning = true;
      this.panDragStart = {
        screenX: event.clientX,
        screenY: event.clientY,
        panX: this.panX,
        panY: this.panY,
      };
      return;
    }

    if (this.selectedTool === 'move') {
      const point = this.getSvgPoint(event);

      // 1. Check Vertex Click (High Priority)
      for (const el of this.elements) {
        if (el.type === 'wall' && el.points) {
          for (let i = 0; i < el.points.length; i++) {
            if (this.getDistance(point, el.points[i]) < 10) {
              // Click tolerance
              this.selectedVertex = { elementId: el.id, pointIndex: i };
              this.isDrawing = true;
              return;
            }
          }
        }
      }

      // 2. Check Wall Body Click (Lower Priority)
      for (const el of this.elements) {
        if (el.type === 'wall' && el.points && el.points.length > 1) {
          for (let i = 0; i < el.points.length - 1; i++) {
            const p1 = el.points[i];
            const p2 = el.points[i + 1];
            if (this.getDistanceToSegment(point, p1, p2) < 10) {
              this.movingElementId = el.id;
              this.lastMousePosition = point;
              this.isDrawing = true;
              return;
            }
          }
        }
      }
    }

    if (this.selectedTool === 'select') {
      if (event.target === event.currentTarget) {
        this.selectedElementId = null;
      }
      return;
    }

    // Polyline logic for walls
    if (this.selectedTool === 'wall') {
      let point = this.getSvgPoint(event);
      console.log('Wall click at', point);

      // If drawing hasn't started, start it
      if (this.activePolylinePoints.length === 0) {
        console.log('Starting wall drawing');
        this.isDrawing = true;
        this.activePolylinePoints = [point]; // Start point (new array ref)
        this.activeWallSegments = [];
        this.cursorPosition = { ...point }; // Init cursor
      } else {
        const startPoint = this.activePolylinePoints[0];
        const lastPoint =
          this.activePolylinePoints[this.activePolylinePoints.length - 1];

        // Apply orthogonal constraint on click if Shift is held
        if (event.shiftKey) {
          const dx = Math.abs(point.x - lastPoint.x);
          const dy = Math.abs(point.y - lastPoint.y);
          if (dx > dy) {
            point.y = lastPoint.y;
          } else {
            point.x = lastPoint.x;
          }
        }

        console.log('Adding point to wall');
        // Check for closing loop (click near start point)
        const distToStart = this.getDistance(point, startPoint);

        // Allow closing the loop if we have enough points (triangle at least)
        if (this.activePolylinePoints.length > 2 && distToStart < 15) {
          // Snapping tolerance
          console.log('Closing loop');
          // Close the loop
          this.finishPolyline([...this.activePolylinePoints, startPoint]);
          return;
        } else {
          // Add point (new array ref to trigger change detection if needed)
          this.activePolylinePoints = [...this.activePolylinePoints, point];
          // Update segments
          this.activeWallSegments = this.getWallSegments(
            this.activePolylinePoints,
          );
        }
      }
      return;
    }

    // Other tools (Drag-based)
    const point = this.getSvgPoint(event);
    this.isDrawing = true;
    this.startPoint = point;

    if (this.selectedTool === 'door') {
      this.currentElement = {
        id: Date.now().toString(),
        type: 'door',
        x: point.x,
        y: point.y,
        x2: point.x,
        y2: point.y,
      };
    } else if (this.selectedTool === 'rack') {
      this.currentElement = {
        id: Date.now().toString(),
        type: 'rack',
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      };
    }
  }

  onMouseMove(event: MouseEvent) {
    // Pan takes highest priority
    if (this.isPanning && this.panDragStart) {
      this.panX =
        this.panDragStart.panX + (event.clientX - this.panDragStart.screenX);
      this.panY =
        this.panDragStart.panY + (event.clientY - this.panDragStart.screenY);
      this.scheduleUpdateGrid();
      return;
    }

    let point = this.getSvgPoint(event);

    // Clear snap indicator when not dragging a vertex
    if (
      !(this.selectedTool === 'move' && this.isDrawing && this.selectedVertex)
    ) {
      this.snapTargetVertex = null;
    }

    // Hover detection in move mode (when not dragging)
    if (this.selectedTool === 'move' && !this.isDrawing) {
      let found: {
        elementId: string;
        pointIndex: number;
        x: number;
        y: number;
      } | null = null;
      outer: for (const el of this.elements) {
        if (el.type === 'wall' && el.points) {
          for (let i = 0; i < el.points.length; i++) {
            if (this.getDistance(point, el.points[i]) < 10) {
              found = {
                elementId: el.id,
                pointIndex: i,
                x: el.points[i].x,
                y: el.points[i].y,
              };
              break outer;
            }
          }
        }
      }
      this.hoveredVertex = found;
    }

    // Whole Wall Moving Logic
    if (
      this.selectedTool === 'move' &&
      this.isDrawing &&
      this.movingElementId &&
      this.lastMousePosition
    ) {
      const el = this.elements.find((e) => e.id === this.movingElementId);
      if (el && el.points) {
        const dx = point.x - this.lastMousePosition.x;
        const dy = point.y - this.lastMousePosition.y;

        // Translate all points
        el.points = el.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        this.updateWallDerived(el);
        this.lastMousePosition = point;
      }
      return;
    }

    // Vertex Moving Logic
    if (this.selectedTool === 'move' && this.isDrawing && this.selectedVertex) {
      const el = this.elements.find(
        (e) => e.id === this.selectedVertex!.elementId,
      );
      if (el && el.points) {
        // No extra snapping: getSvgPoint already handles grid snap on Alt

        // Orthogonal constraint (Shift key): H/V lock relative to the nearest neighbor
        if (event.shiftKey) {
          const idx = this.selectedVertex!.pointIndex;
          const pts = el.points;
          const isClosed =
            pts.length > 2 && this.getDistance(pts[0], pts[pts.length - 1]) < 2;

          // Resolve prev/next neighbor indices
          let prevIdx: number | null = null;
          let nextIdx: number | null = null;

          if (idx > 0) {
            prevIdx = idx - 1;
          } else if (isClosed && pts.length > 2) {
            prevIdx = pts.length - 2;
          }
          if (idx < pts.length - 1) {
            nextIdx = idx + 1;
          } else if (isClosed && pts.length > 2) {
            nextIdx = 1;
          }

          // Pick the neighbor closest to the current mouse position
          let refIdx: number | null = null;
          if (prevIdx !== null && nextIdx !== null) {
            refIdx =
              this.getDistance(point, pts[prevIdx]) <
              this.getDistance(point, pts[nextIdx])
                ? prevIdx
                : nextIdx;
          } else {
            refIdx = prevIdx !== null ? prevIdx : nextIdx;
          }

          if (refIdx !== null) {
            const ref = pts[refIdx];
            const dx = Math.abs(point.x - ref.x);
            const dy = Math.abs(point.y - ref.y);
            point =
              dx > dy ? { x: point.x, y: ref.y } : { x: ref.x, y: point.y };
          }
        }

        // Snap to vertices of other walls
        this.snapTargetVertex = null;
        const SNAP_RADIUS = 15 / this.zoom;
        outer: for (const other of this.elements) {
          if (other.id === el.id || !other.points) continue;
          for (let j = 0; j < other.points.length; j++) {
            if (this.getDistance(point, other.points[j]) < SNAP_RADIUS) {
              this.snapTargetVertex = {
                elementId: other.id,
                pointIndex: j,
                x: other.points[j].x,
                y: other.points[j].y,
              };
              point = { x: other.points[j].x, y: other.points[j].y };
              break outer;
            }
          }
        }

        // Check if loop was closed *before* we modify
        let wasClosed = false;
        if (el.points.length > 2) {
          const first = el.points[0];
          const last = el.points[el.points.length - 1];
          if (this.getDistance(first, last) < 2) wasClosed = true;
        }

        el.points[this.selectedVertex.pointIndex] = point;

        // Maintain closure if it was closed and we moved start or end
        if (wasClosed) {
          if (this.selectedVertex.pointIndex === 0) {
            el.points[el.points.length - 1] = point;
          } else if (this.selectedVertex.pointIndex === el.points.length - 1) {
            el.points[0] = point;
          }
        }
        this.updateWallDerived(el);
      }
      return;
    }

    // Polyline preview logic
    if (
      this.selectedTool === 'wall' &&
      this.isDrawing &&
      this.activePolylinePoints.length > 0
    ) {
      const lastPoint =
        this.activePolylinePoints[this.activePolylinePoints.length - 1];

      // Orthogonal constraint (Shift key)
      if (event.shiftKey) {
        const dx = Math.abs(point.x - lastPoint.x);
        const dy = Math.abs(point.y - lastPoint.y);
        if (dx > dy) {
          point.y = lastPoint.y; // Snap to horizontal
        } else {
          point.x = lastPoint.x; // Snap to vertical
        }
      }

      this.intersectionPoint = null;
      this.vertexSnapPoint = null;

      // First find if there IS an intersection up to the current mouse point
      const intersection = this.checkIntersections(point);
      const vertex = this.getClosestVertex(point, 20); // 20px snap radius

      if (intersection) {
        this.intersectionPoint = intersection;
        // The wall cannot go beyond this intersection point.
        // We clamp 'point' to the intersection.
        point = intersection;

        // However, if the intersection IS actually a vertex (e.g. we hit a corner),
        // we want the magnetic "snap" feeling.
        if (vertex && this.getDistance(vertex, intersection) < 10) {
          this.vertexSnapPoint = vertex;
          point = vertex;
        }
      } else if (vertex) {
        // No intersection blocking us, free to snap to vertex
        this.vertexSnapPoint = vertex;
        point = this.vertexSnapPoint;
      }

      this.cursorPosition = point;
      this.previewAngles = this.getWallAngles(
        this.activePolylinePoints,
        this.cursorPosition,
      );

      // Calculate length of current segment (from last point to cursor)
      this.currentSegmentLength = this.getDistance(
        lastPoint,
        this.cursorPosition,
      );
      return;
    }

    // Allow dragging for other tools
    if (!this.isDrawing || !this.currentElement || !this.startPoint) return;

    if (this.currentElement.type === 'door') {
      this.currentElement.x2 = point.x;
      this.currentElement.y2 = point.y;
    } else if (this.currentElement.type === 'rack') {
      const width = point.x - this.startPoint.x;
      const height = point.y - this.startPoint.y;

      this.currentElement.x = width < 0 ? point.x : this.startPoint.x;
      this.currentElement.y = height < 0 ? point.y : this.startPoint.y;
      this.currentElement.width = Math.abs(width);
      this.currentElement.height = Math.abs(height);
    }
  }

  onMouseUp(event: MouseEvent) {
    if (this.isPanning) {
      this.isPanning = false;
      this.panDragStart = null;
      return;
    }

    if (this.selectedTool === 'move') {
      // Attempt merge if vertex was snapped onto another wall
      if (this.selectedVertex && this.snapTargetVertex) {
        const elA = this.elements.find(
          (e) => e.id === this.selectedVertex!.elementId,
        );
        const elB = this.elements.find(
          (e) => e.id === this.snapTargetVertex!.elementId,
        );
        if (elA && elB) {
          this.mergeWalls(
            elA,
            this.selectedVertex.pointIndex,
            elB,
            this.snapTargetVertex.pointIndex,
          );
        }
      }
      this.isDrawing = false;
      this.selectedVertex = null;
      this.movingElementId = null;
      this.lastMousePosition = null;
      this.snapTargetVertex = null;
      return;
    }

    // For walls, drawing continues until explicitly finished or closed,
    // so we don't handle mouseUp (unless we wanted drag-segment, but AutoCad is point-to-point clicks usually)
    if (this.selectedTool === 'wall') return;

    if (!this.isDrawing) return;

    // For other tools (drag to create)
    if (this.currentElement) {
      if (this.currentElement.type === 'rack') {
        if (
          (this.currentElement.width || 0) < 10 ||
          (this.currentElement.height || 0) < 10
        ) {
          this.currentElement.width = 60;
          this.currentElement.height = 100;
          this.currentElement.x = this.startPoint!.x - 30;
          this.currentElement.y = this.startPoint!.y - 50;
        }
      }
      this.elements.push(this.currentElement);
    }

    this.isDrawing = false;
    this.currentElement = null;
    this.startPoint = null;
  }

  // Explicitly finish polyline (e.g. invalid double click, or ESC key)
  finishPolyline(points?: { x: number; y: number }[]) {
    const finalPoints = points || this.activePolylinePoints;
    if (finalPoints.length > 1) {
      const newEl: MapElement = {
        id: Date.now().toString(),
        type: 'wall',
        x: 0,
        y: 0,
        points: [...finalPoints],
      };
      this.updateWallDerived(newEl);
      this.elements.push(newEl);
    }
    this.cancelDrawing();
  }

  onDoubleClick(event: MouseEvent) {
    if (this.selectedTool !== 'move') return;
    const point = this.getSvgPoint(event);

    for (const el of this.elements) {
      if (el.type === 'wall' && el.points && el.points.length > 1) {
        for (let i = 0; i < el.points.length - 1; i++) {
          const p1 = el.points[i];
          const p2 = el.points[i + 1];
          const dist = this.getDistanceToSegment(point, p1, p2);
          if (dist < 10) {
            // Project point onto segment to get exact position on the wall
            const l2 = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);
            let t =
              ((point.x - p1.x) * (p2.x - p1.x) +
                (point.y - p1.y) * (p2.y - p1.y)) /
              l2;
            t = Math.max(0, Math.min(1, t));
            const projected = {
              x: p1.x + t * (p2.x - p1.x),
              y: p1.y + t * (p2.y - p1.y),
            };
            // Insert the new vertex between i and i+1 (new array ref for change detection)
            const newPoints = [...el.points];
            newPoints.splice(i + 1, 0, projected);
            el.points = newPoints;
            this.updateWallDerived(el);
            this.elements = [...this.elements];
            event.stopPropagation();
            return;
          }
        }
      }
    }
  }

  onElementClick(event: MouseEvent, element: MapElement) {
    if (this.selectedTool === 'select') {
      event.stopPropagation();
      this.selectedElementId = element.id;
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.selectedTool === 'wall' && this.isDrawing) {
        // Finish polyline on Escape if we have points
        this.finishPolyline();
      } else {
        this.cancelDrawing();
        this.selectedElementId = null;
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Delete hovered vertex in move mode
      if (this.selectedTool === 'move' && this.hoveredVertex) {
        const el = this.elements.find(
          (e) => e.id === this.hoveredVertex!.elementId,
        );
        if (el && el.points && el.points.length > 2) {
          // Keep at least 2 points
          const newPoints = el.points.filter(
            (_, i) => i !== this.hoveredVertex!.pointIndex,
          );
          el.points = newPoints;
          this.updateWallDerived(el);
          this.elements = [...this.elements];
          this.hoveredVertex = null;
        }
        return;
      }
      // Delete whole element in select mode
      if (this.selectedElementId) {
        this.elements = this.elements.filter(
          (e) => e.id !== this.selectedElementId,
        );
        this.selectedElementId = null;
      }
    }

    // Enter to finish polyline
    if (
      event.key === 'Enter' &&
      this.selectedTool === 'wall' &&
      this.isDrawing
    ) {
      this.finishPolyline();
    }
  }
}
