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
  segments?: {
    x: number;
    y: number;
    length: number;
    angle: number;
    labelX: number;
    labelY: number;
  }[];
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
  activeWallSegments: {
    x: number;
    y: number;
    length: number;
    angle: number;
    labelX: number;
    labelY: number;
  }[] = [];
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
  gridPath = ''; // 10cm minor grid
  gridPathMajor = ''; // 1m major grid

  // Detected rooms (enclosed faces in the wall planar graph)
  rooms: { area: number; cx: number; cy: number }[] = [];

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
    // Minor grid: 10cm
    const minor = 10 * this.zoom;
    if (minor < 2) {
      this.gridPath = '';
      this.gridPathMajor = '';
      this.cdr.markForCheck();
      return;
    }
    const offXm = ((this.panX % minor) + minor) % minor;
    const offYm = ((this.panY % minor) + minor) % minor;
    let dMinor = '';
    for (let x = offXm; x <= W + minor; x += minor)
      dMinor += `M${x},0 L${x},${H} `;
    for (let y = offYm; y <= H + minor; y += minor)
      dMinor += `M0,${y} L${W},${y} `;
    this.gridPath = dMinor;
    // Major grid: 100cm = 1m
    const major = 100 * this.zoom;
    const offXM = ((this.panX % major) + major) % major;
    const offYM = ((this.panY % major) + major) % major;
    let dMajor = '';
    for (let x = offXM; x <= W + major; x += major)
      dMajor += `M${x},0 L${x},${H} `;
    for (let y = offYM; y <= H + major; y += major)
      dMajor += `M0,${y} L${W},${y} `;
    this.gridPathMajor = dMajor;
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

  // Get midpoints and lengths for wall segments (used for preview during drawing, no centroid available)
  getWallSegments(points: { x: number; y: number }[] | undefined): {
    x: number;
    y: number;
    length: number;
    angle: number;
    labelX: number;
    labelY: number;
  }[] {
    if (!points || points.length < 2) return [];
    const LABEL_DIST = 16 / this.zoom;
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const rdx = p2.x - p1.x,
        rdy = p2.y - p1.y;
      const rdlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
      const length = this.getDistance(p1, p2);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      let angle = (Math.atan2(rdy, rdx) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      // Left normal (consistent direction for open polylines)
      const nx = -rdy / rdlen;
      const ny = rdx / rdlen;
      segments.push({
        x: midX,
        y: midY,
        length,
        angle,
        labelX: midX + nx * LABEL_DIST,
        labelY: midY + ny * LABEL_DIST,
      });
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

    const pts = el.points;
    const LABEL_DIST = 16 / this.zoom;

    // Centroid first (needed to determine outward normal for segment labels)
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

    // Segments: outward normal determined using centroid
    const segs: {
      x: number;
      y: number;
      length: number;
      angle: number;
      labelX: number;
      labelY: number;
    }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i],
        p2 = pts[i + 1];
      const rdx = p2.x - p1.x,
        rdy = p2.y - p1.y;
      const rdlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      let angle = (Math.atan2(rdy, rdx) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      // Left normal as default outward direction
      let nx = -rdy / rdlen;
      let ny = rdx / rdlen;
      // For closed polygons: flip if normal points toward centroid (we want outward)
      if (computedCx !== undefined && computedCy !== undefined) {
        const toCx = computedCx - midX,
          toCy = computedCy - midY;
        if (nx * toCx + ny * toCy > 0) {
          nx = -nx;
          ny = -ny;
        }
      }
      segs.push({
        x: midX,
        y: midY,
        length: this.getDistance(p1, p2),
        angle,
        labelX: midX + nx * LABEL_DIST,
        labelY: midY + ny * LABEL_DIST,
      });
    }
    el.segments = segs;

    // Angles: inward bisector (computed after centroid)
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
    this.rooms = this.computeRooms();
    this.scheduleUpdateGrid();
  }

  // Detect all enclosed rooms using planar graph face traversal on the wall network
  private computeRooms(): { area: number; cx: number; cy: number }[] {
    const EPS = 3;
    type Pt = { x: number; y: number };
    const pts: Pt[] = [];
    const findOrAdd = (p: Pt): number => {
      for (let i = 0; i < pts.length; i++) {
        if (Math.abs(pts[i].x - p.x) < EPS && Math.abs(pts[i].y - p.y) < EPS)
          return i;
      }
      pts.push({ x: p.x, y: p.y });
      return pts.length - 1;
    };
    const edgeSet = new Set<string>();
    const edgeList: [number, number][] = [];
    const addEdge = (a: number, b: number) => {
      if (a === b) return;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edgeList.push([a, b]);
    };
    for (const el of this.elements) {
      if (el.type !== 'wall' || !el.points || el.points.length < 2) continue;
      for (let i = 0; i < el.points.length - 1; i++) {
        addEdge(findOrAdd(el.points[i]), findOrAdd(el.points[i + 1]));
      }
    }
    if (pts.length < 3 || edgeList.length < 3) return [];
    const adj: number[][] = Array.from({ length: pts.length }, () => []);
    for (const [a, b] of edgeList) {
      adj[a].push(b);
      adj[b].push(a);
    }
    for (let v = 0; v < pts.length; v++) {
      adj[v].sort((a, b) => {
        const aa = Math.atan2(pts[a].y - pts[v].y, pts[a].x - pts[v].x);
        const ba = Math.atan2(pts[b].y - pts[v].y, pts[b].x - pts[v].x);
        return aa - ba;
      });
    }
    const nextHE = (u: number, v: number): number => {
      const inAng = Math.atan2(pts[u].y - pts[v].y, pts[u].x - pts[v].x);
      let best = -1,
        bestDelta = -Infinity;
      for (const w of adj[v]) {
        if (w === u) continue;
        const outAng = Math.atan2(pts[w].y - pts[v].y, pts[w].x - pts[v].x);
        let d = outAng - inAng;
        if (d <= 0) d += 2 * Math.PI;
        if (d > bestDelta) {
          bestDelta = d;
          best = w;
        }
      }
      return best;
    };
    // Signed distance from point to face boundary (positive = inside, negative = outside)
    const signedDistToFace = (
      px: number,
      py: number,
      face: number[],
    ): number => {
      let inside = false;
      let minD = Infinity;
      for (let i = 0, j = face.length - 1; i < face.length; j = i++) {
        const ax = pts[face[j]].x,
          ay = pts[face[j]].y;
        const bx = pts[face[i]].x,
          by = pts[face[i]].y;
        // ray-cast for inside test
        if (
          by > py !== ay > py &&
          px < ((ax - bx) * (py - by)) / (ay - by) + bx
        )
          inside = !inside;
        // distance to edge
        const dx = bx - ax,
          dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        const t =
          lenSq === 0
            ? 0
            : Math.max(
                0,
                Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq),
              );
        const ex = px - ax - t * dx,
          ey = py - ay - t * dy;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d < minD) minD = d;
      }
      return inside ? minD : -minD;
    };

    // Polylabel: iterative cell-refinement to find the point farthest from all edges
    const polylabel = (face: number[]): { cx: number; cy: number } => {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const vi of face) {
        if (pts[vi].x < minX) minX = pts[vi].x;
        if (pts[vi].x > maxX) maxX = pts[vi].x;
        if (pts[vi].y < minY) minY = pts[vi].y;
        if (pts[vi].y > maxY) maxY = pts[vi].y;
      }
      const width = maxX - minX,
        height = maxY - minY;
      const cellSize = Math.max(width, height);
      if (cellSize === 0) return { cx: minX, cy: minY };

      // Each cell: [cx, cy, h, d, maxD]  h = half-size
      // maxD = d + h*sqrt(2)  — upper bound on best achievable dist inside cell
      type Cell = [number, number, number, number, number];
      const SQRT2 = 1.4142135623730951;
      const makeCell = (cx: number, cy: number, h: number): Cell => {
        const d = signedDistToFace(cx, cy, face);
        return [cx, cy, h, d, d + h * SQRT2];
      };

      // Max-heap by maxD (index 4)
      const heap: Cell[] = [];
      const heapPush = (c: Cell) => {
        heap.push(c);
        let i = heap.length - 1;
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (heap[parent][4] >= heap[i][4]) break;
          [heap[parent], heap[i]] = [heap[i], heap[parent]];
          i = parent;
        }
      };
      const heapPop = (): Cell => {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length > 0) {
          heap[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1,
              r = 2 * i + 2;
            let best = i;
            if (l < heap.length && heap[l][4] > heap[best][4]) best = l;
            if (r < heap.length && heap[r][4] > heap[best][4]) best = r;
            if (best === i) break;
            [heap[i], heap[best]] = [heap[best], heap[i]];
            i = best;
          }
        }
        return top;
      };

      // Seed coarse grid
      let h = cellSize / 2;
      for (let x = minX; x < maxX; x += cellSize) {
        for (let y = minY; y < maxY; y += cellSize) {
          heapPush(makeCell(x + h, y + h, h));
        }
      }

      // Centroid cell as initial best candidate
      let bestD = -Infinity,
        bestCx = minX + width / 2,
        bestCy = minY + height / 2;
      const centCell = makeCell(bestCx, bestCy, 0);
      if (centCell[3] > bestD) {
        bestD = centCell[3];
        bestCx = centCell[0];
        bestCy = centCell[1];
      }

      const PRECISION = 1.0; // stop when gain < 1px
      while (heap.length > 0) {
        const cell = heapPop();
        if (cell[3] > bestD) {
          bestD = cell[3];
          bestCx = cell[0];
          bestCy = cell[1];
        }
        // Skip if this cell can't improve over bestD + precision
        if (cell[4] - bestD <= PRECISION) continue;
        const ch = cell[2] / 2;
        heapPush(makeCell(cell[0] - ch, cell[1] - ch, ch));
        heapPush(makeCell(cell[0] + ch, cell[1] - ch, ch));
        heapPush(makeCell(cell[0] - ch, cell[1] + ch, ch));
        heapPush(makeCell(cell[0] + ch, cell[1] + ch, ch));
      }
      return { cx: bestCx, cy: bestCy };
    };

    const visited = new Set<string>();
    const rooms: { area: number; cx: number; cy: number }[] = [];
    for (const [ea, eb] of edgeList) {
      for (const [u0, v0] of [
        [ea, eb],
        [eb, ea],
      ] as [number, number][]) {
        if (visited.has(`${u0}|${v0}`)) continue;
        const face: number[] = [];
        let u = u0,
          v = v0;
        for (let step = 0; step < edgeList.length * 2 + 4; step++) {
          const key = `${u}|${v}`;
          if (visited.has(key)) break;
          visited.add(key);
          face.push(v);
          const w = nextHE(u, v);
          if (w === -1) break;
          u = v;
          v = w;
        }
        if (face.length < 3) continue;
        let sa = 0;
        for (let i = 0; i < face.length; i++) {
          const j = (i + 1) % face.length;
          sa +=
            pts[face[i]].x * pts[face[j]].y - pts[face[j]].x * pts[face[i]].y;
        }
        sa /= 2;
        if (sa <= 0) continue; // outer face
        const { cx, cy } = polylabel(face);
        rooms.push({ area: sa, cx, cy });
      }
    }
    return rooms;
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
    this.vertexSnapPoint = null;
    this.edgeSnapPoint = null;
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
  // All co-located vertices that move together with the primary (junction peers)
  selectedVertexPeers: { elementId: string; pointIndex: number }[] = [];
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

  // Snap-to-edge target while drawing a wall (snaps cursor to a wall segment)
  edgeSnapPoint: {
    x: number;
    y: number;
    elementId: string;
    segIndex: number;
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
    const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return this.getDistance(p, proj);
  }

  // Find closest point on any wall segment to `point`, within `tolerance` SVG units.
  // Returns null if nothing is close enough, or if snap would land on an existing vertex.
  private getClosestEdgeSnap(
    point: { x: number; y: number },
    tolerance: number,
  ): { x: number; y: number; elementId: string; segIndex: number } | null {
    let best: {
      x: number;
      y: number;
      elementId: string;
      segIndex: number;
    } | null = null;
    let minDist = tolerance;
    for (const el of this.elements) {
      if (el.type !== 'wall' || !el.points || el.points.length < 2) continue;
      for (let i = 0; i < el.points.length - 1; i++) {
        const p1 = el.points[i];
        const p2 = el.points[i + 1];
        const dist = this.getDistanceToSegment(point, p1, p2);
        if (dist >= minDist) continue;
        const l2 = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);
        if (l2 === 0) continue;
        const t = Math.min(
          1,
          Math.max(
            0,
            ((point.x - p1.x) * (p2.x - p1.x) +
              (point.y - p1.y) * (p2.y - p1.y)) /
              l2,
          ),
        );
        const sx = p1.x + t * (p2.x - p1.x);
        const sy = p1.y + t * (p2.y - p1.y);
        // Skip if snap point virtually coincides with an endpoint (vertex snap handles those)
        if (t < 0.01 || t > 0.99) continue;
        minDist = dist;
        best = { x: sx, y: sy, elementId: el.id, segIndex: i };
      }
    }
    return best;
  }

  // Insert a new vertex into a wall at `pt` between points[segIndex] and points[segIndex+1].
  private splitWallAtPoint(
    elementId: string,
    segIndex: number,
    pt: { x: number; y: number },
  ): void {
    const el = this.elements.find((e) => e.id === elementId);
    if (!el?.points) return;
    const newPoints = [...el.points];
    newPoints.splice(segIndex + 1, 0, { x: pt.x, y: pt.y });
    el.points = newPoints;
    this.updateWallDerived(el);
    this.elements = [...this.elements];
    this.rooms = this.computeRooms();
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
              // Find all junction peers: other walls with a vertex at the same position
              const clickedPt = el.points[i];
              this.selectedVertexPeers = [];
              for (const other of this.elements) {
                if (other.type !== 'wall' || !other.points) continue;
                for (let j = 0; j < other.points.length; j++) {
                  if (other.id === el.id && j === i) continue;
                  if (this.getDistance(clickedPt, other.points[j]) < 2) {
                    this.selectedVertexPeers.push({
                      elementId: other.id,
                      pointIndex: j,
                    });
                  }
                }
              }
              this.isDrawing = true;
              return;
            }
          }
        }
      }

      // 2. Check Wall Body Click (Lower Priority) → move ALL elements together
      for (const el of this.elements) {
        if (el.type === 'wall' && el.points && el.points.length > 1) {
          for (let i = 0; i < el.points.length - 1; i++) {
            const p1 = el.points[i];
            const p2 = el.points[i + 1];
            if (this.getDistanceToSegment(point, p1, p2) < 10) {
              this.movingElementId = '__ALL__';
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
        // Snap start point to edge if applicable
        const startVert = this.getClosestVertex(point, 20);
        if (startVert) {
          point = startVert;
        } else {
          const startEdge = this.getClosestEdgeSnap(point, 15);
          if (startEdge) {
            point = { x: startEdge.x, y: startEdge.y };
            this.splitWallAtPoint(
              startEdge.elementId,
              startEdge.segIndex,
              point,
            );
          }
        }
        this.isDrawing = true;
        this.activePolylinePoints = [point];
        this.activeWallSegments = [];
        this.cursorPosition = { ...point };
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
          // Snap to vertex or edge before adding point
          const addVert = this.getClosestVertex(point, 20);
          if (addVert) {
            point = addVert;
          } else {
            const addEdge = this.getClosestEdgeSnap(point, 15);
            if (addEdge) {
              point = { x: addEdge.x, y: addEdge.y };
              this.splitWallAtPoint(addEdge.elementId, addEdge.segIndex, point);
            }
          }
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
      const dx = point.x - this.lastMousePosition.x;
      const dy = point.y - this.lastMousePosition.y;

      if (this.movingElementId === '__ALL__') {
        // Translate every element together
        for (const el of this.elements) {
          if (el.points) {
            el.points = el.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
            if (el.type === 'wall') this.updateWallDerived(el);
          } else {
            el.x = (el.x ?? 0) + dx;
            el.y = (el.y ?? 0) + dy;
          }
        }
      } else {
        const el = this.elements.find((e) => e.id === this.movingElementId);
        if (el && el.points) {
          el.points = el.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          this.updateWallDerived(el);
        }
      }
      this.lastMousePosition = point;
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
          // Skip junction peers — they move with us, not snap targets
          if (this.selectedVertexPeers.some((p) => p.elementId === other.id))
            continue;
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

        // Move all junction peers to the same final position
        for (const peer of this.selectedVertexPeers) {
          const peerEl = this.elements.find((e) => e.id === peer.elementId);
          if (!peerEl || !peerEl.points) continue;
          // Check peer closure BEFORE modifying
          let peerWasClosed = false;
          if (peerEl.points.length > 2) {
            peerWasClosed =
              this.getDistance(
                peerEl.points[0],
                peerEl.points[peerEl.points.length - 1],
              ) < 2;
          }
          peerEl.points[peer.pointIndex] = point;
          if (peerWasClosed) {
            if (peer.pointIndex === 0)
              peerEl.points[peerEl.points.length - 1] = point;
            else if (peer.pointIndex === peerEl.points.length - 1)
              peerEl.points[0] = point;
          }
          this.updateWallDerived(peerEl);
        }
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
      this.edgeSnapPoint = null;

      // First find if there IS an intersection up to the current mouse point
      const intersection = this.checkIntersections(point);
      const vertex = this.getClosestVertex(point, 20); // 20px snap radius

      if (intersection) {
        this.intersectionPoint = intersection;
        point = intersection;
        if (vertex && this.getDistance(vertex, intersection) < 10) {
          this.vertexSnapPoint = vertex;
          point = vertex;
        }
      } else if (vertex) {
        this.vertexSnapPoint = vertex;
        point = this.vertexSnapPoint;
      } else {
        // No vertex snap: try edge snap
        const edge = this.getClosestEdgeSnap(point, 15);
        if (edge) {
          this.edgeSnapPoint = edge;
          point = { x: edge.x, y: edge.y };
        }
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
      this.selectedVertexPeers = [];
      this.movingElementId = null;
      this.lastMousePosition = null;
      this.snapTargetVertex = null;
      this.rooms = this.computeRooms();
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
    this.rooms = this.computeRooms();
    this.cancelDrawing();
  }

  onDoubleClick(event: MouseEvent) {
    if (this.selectedTool !== 'move') return;
    const point = this.getSvgPoint(event);
    const SNAP = 10 / this.zoom;

    // ── Priority 1: double-click on an EXISTING VERTEX → split polyline ──
    for (const el of this.elements) {
      if (el.type !== 'wall' || !el.points || el.points.length < 2) continue;
      const pts = el.points;
      for (let i = 0; i < pts.length; i++) {
        if (this.getDistance(point, pts[i]) >= SNAP) continue;

        const isClosed =
          pts.length >= 4 && this.getDistance(pts[0], pts[pts.length - 1]) <= 2;

        if (isClosed) {
          // Remove the duplicate closing point, then rotate so vertex i is the open end
          const ring = pts.slice(0, pts.length - 1); // remove last (= first)
          const n = ring.length;
          if (n < 2) break;
          const rotated = [...ring.slice(i % n), ...ring.slice(0, i % n)];
          el.points = rotated;
        } else {
          // Open polyline: split into two at vertex i (only if it's an interior vertex)
          if (i === 0 || i === pts.length - 1) break; // endpoint → nothing to do
          const partA = pts.slice(0, i + 1);
          const partB = pts.slice(i);
          el.points = partA;
          this.updateWallDerived(el);
          const newEl: MapElement = {
            id: `wall-${Date.now()}`,
            type: 'wall',
            x: 0,
            y: 0,
            points: partB,
          };
          this.updateWallDerived(newEl);
          this.elements = [...this.elements, newEl];
          this.rooms = this.computeRooms();
          event.stopPropagation();
          return;
        }

        this.updateWallDerived(el);
        this.elements = [...this.elements];
        this.rooms = this.computeRooms();
        event.stopPropagation();
        return;
      }
    }

    // ── Priority 2: double-click on a SEGMENT → insert new vertex ──
    for (const el of this.elements) {
      if (el.type === 'wall' && el.points && el.points.length > 1) {
        for (let i = 0; i < el.points.length - 1; i++) {
          const p1 = el.points[i];
          const p2 = el.points[i + 1];
          const dist = this.getDistanceToSegment(point, p1, p2);
          if (dist < 10) {
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
          this.rooms = this.computeRooms();
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
        this.rooms = this.computeRooms();
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
