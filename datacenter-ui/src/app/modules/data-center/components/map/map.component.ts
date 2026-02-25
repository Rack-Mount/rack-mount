import {
  Component,
  HostListener,
  ViewChild,
  ElementRef,
  AfterViewInit,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapSidebarComponent } from '../map-sidebar/map-sidebar.component';
import { AngleLabel, MapElement, Point, Room, WallSegment } from './map.types';
import { LocationService } from '../../../core/api/v1/api/location.service';
import { Room as DjRoom } from '../../../core/api/v1/model/room';
import { dist, distToSegment } from './map-geometry.utils';
import {
  updateWallDerived as _deriveWall,
  computeWallSegments,
  computeWallAngles,
} from './wall-display.utils';
import {
  computeRooms as _computeRooms,
  mergeWalls as _mergeWalls,
  computeJunctionAngles,
  restoreRoomNames,
} from './wall-graph.utils';
import {
  checkIntersections,
  getClosestEdgeSnap,
  getClosestVertex,
} from './wall-snap.utils';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule, MapSidebarComponent],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements AfterViewInit {
  constructor(
    private cdr: ChangeDetectorRef,
    private locationService: LocationService,
  ) {}
  selectedTool: string = 'select';

  elements: MapElement[] = [];

  // Floor plan persistence
  availableRooms: DjRoom[] = [];
  selectedRoomId: number | null = null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  private saveStatusTimer: ReturnType<typeof setTimeout> | null = null;

  isDrawing = false;
  currentElement: MapElement | null = null;
  startPoint: { x: number; y: number } | null = null;
  selectedElementId: string | null = null;

  // Polyline drawing state
  activePolylinePoints: Point[] = [];
  activeWallSegments: WallSegment[] = [];
  previewAngles: AngleLabel[] = [];
  cursorPosition: Point = { x: 0, y: 0 };
  currentSegmentLength = 0;
  intersectionPoint: Point | null = null;
  vertexSnapPoint: Point | null = null;

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
  rooms: Room[] = [];

  // Room name persistence: key = "${roundedCx}_${roundedCy}"
  editingRoomIndex: number | null = null;
  editingRoomName = '';

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
  @ViewChild('activeRoomInput')
  activeRoomInputRef?: ElementRef<HTMLInputElement>;

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

    // Load available rooms for floor plan selector
    this.loadRooms();
  }

  loadRooms(): void {
    this.locationService.locationRoomList().subscribe({
      next: (data) => {
        this.availableRooms = data.results ?? [];
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Failed to load rooms', err),
    });
  }

  onRoomSelect(id: number): void {
    if (!id) {
      this.selectedRoomId = null;
      this.elements = [];
      this.rederiveAllWalls();
      return;
    }
    this.selectedRoomId = id;
    this.locationService.locationRoomRetrieve({ id }).subscribe({
      next: (room) => {
        this.elements = room.floor_plan_data ? (room.floor_plan_data as MapElement[]) : [];
        this.rederiveAllWalls();
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Failed to load floor plan', err),
    });
  }

  saveFloorPlan(): void {
    if (this.selectedRoomId == null) return;
    this.saveStatus = 'saving';
    this.locationService
      .locationRoomPartialUpdate({
        id: this.selectedRoomId,
        patchedRoom: { floor_plan_data: this.elements },
      })
      .subscribe({
        next: () => {
          this.saveStatus = 'saved';
          this.resetSaveStatusAfterDelay();
        },
        error: (err) => {
          console.error('Failed to save floor plan', err);
          this.saveStatus = 'error';
          this.resetSaveStatusAfterDelay();
        },
      });
  }

  private resetSaveStatusAfterDelay(): void {
    if (this.saveStatusTimer) clearTimeout(this.saveStatusTimer);
    this.saveStatusTimer = setTimeout(() => {
      this.saveStatus = 'idle';
      this.cdr.markForCheck();
    }, 3000);
  }

  get polylinePreviewPoints(): string {
    if (this.activePolylinePoints.length === 0) return '';
    // Current confirmed points
    return this.activePolylinePoints.map((p) => `${p.x},${p.y}`).join(' ');
  }

  // Delegate to util (note: param order differs — cursor was 2nd here, last in util)
  getWallAngles(
    points: Point[],
    cursor?: Point,
    centroidX?: number,
    centroidY?: number,
  ): AngleLabel[] {
    return computeWallAngles(points, this.zoom, centroidX, centroidY, cursor);
  }

  getWallSegments(points: Point[] | undefined): WallSegment[] {
    if (!points || points.length < 2) return [];
    return computeWallSegments(points, this.zoom);
  }

  // Delegates to wall-display.utils; zoom is required by the util
  private updateWallDerived(el: MapElement): void {
    _deriveWall(el, this.zoom);
  }

  // Delegates to wall-graph.utils; mutates elA.points and returns filtered elements array
  private mergeWalls(
    elA: MapElement,
    idxA: number,
    elB: MapElement,
    idxB: number,
  ): void {
    this.elements = _mergeWalls(this.elements, elA, idxA, elB, idxB);
    this.updateWallDerived(elA);
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
    computeJunctionAngles(this.elements, this.zoom);
    this.rooms = restoreRoomNames(_computeRooms(this.elements), this.rooms);
    this.scheduleUpdateGrid();
  }

  confirmEditRoom(): void {
    if (this.editingRoomIndex === null) return;
    const room = this.rooms[this.editingRoomIndex];
    const newName = this.editingRoomName.trim();
    room.name = newName || undefined;
    this.editingRoomIndex = null;
  }

  startEditRoom(index: number, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.editingRoomIndex = index;
    this.editingRoomName = this.rooms[index]?.name ?? '';
    setTimeout(() => {
      this.activeRoomInputRef?.nativeElement.focus();
      this.activeRoomInputRef?.nativeElement.select();
    }, 0);
  }

  cancelEditRoom(): void {
    this.editingRoomIndex = null;
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
    this.rooms = restoreRoomNames(_computeRooms(this.elements), this.rooms);
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
            if (dist(point, el.points[i]) < 10) {
              // Click tolerance
              this.selectedVertex = { elementId: el.id, pointIndex: i };
              // Find all junction peers: other walls with a vertex at the same position
              const clickedPt = el.points[i];
              this.selectedVertexPeers = [];
              for (const other of this.elements) {
                if (other.type !== 'wall' || !other.points) continue;
                for (let j = 0; j < other.points.length; j++) {
                  if (other.id === el.id && j === i) continue;
                  if (dist(clickedPt, other.points[j]) < 2) {
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
            if (distToSegment(point, p1, p2) < 10) {
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

      // If drawing hasn't started, start it
      if (this.activePolylinePoints.length === 0) {
        // Snap start point to edge if applicable
        const startVert = getClosestVertex(
          point,
          20,
          this.elements,
          this.activePolylinePoints,
        );
        if (startVert) {
          point = startVert;
        } else {
          const startEdge = getClosestEdgeSnap(point, 15, this.elements);
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

        // Check for closing loop (click near start point)
        const distToStart = dist(point, startPoint);

        // Allow closing the loop if we have enough points (triangle at least)
        if (this.activePolylinePoints.length > 2 && distToStart < 15) {
          // Snapping tolerance
          // Close the loop
          this.finishPolyline([...this.activePolylinePoints, startPoint]);
          return;
        } else {
          // Snap to vertex or edge before adding point
          const addVert = getClosestVertex(
            point,
            20,
            this.elements,
            this.activePolylinePoints,
          );
          if (addVert) {
            point = addVert;
          } else {
            const addEdge = getClosestEdgeSnap(point, 15, this.elements);
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
            if (dist(point, el.points[i]) < 10) {
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
            pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 2;

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
              dist(point, pts[prevIdx]) < dist(point, pts[nextIdx])
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
            if (dist(point, other.points[j]) < SNAP_RADIUS) {
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
          if (dist(first, last) < 2) wasClosed = true;
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
              dist(peerEl.points[0], peerEl.points[peerEl.points.length - 1]) <
              2;
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

    // Snap preview when wall tool is selected but drawing hasn't started yet
    if (this.selectedTool === 'wall' && !this.isDrawing) {
      this.vertexSnapPoint = null;
      this.edgeSnapPoint = null;
      const vertex = getClosestVertex(
        point,
        20,
        this.elements,
        this.activePolylinePoints,
      );
      if (vertex) {
        this.vertexSnapPoint = vertex;
      } else {
        const edge = getClosestEdgeSnap(point, 15, this.elements);
        if (edge) {
          this.edgeSnapPoint = edge;
        }
      }
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
      const intersection = checkIntersections(
        point,
        this.activePolylinePoints,
        this.elements,
      );
      const vertex = getClosestVertex(
        point,
        20,
        this.elements,
        this.activePolylinePoints,
      ); // 20px snap radius

      if (intersection) {
        this.intersectionPoint = intersection;
        point = intersection;
        if (vertex && dist(vertex, intersection) < 10) {
          this.vertexSnapPoint = vertex;
          point = vertex;
        }
      } else if (vertex) {
        this.vertexSnapPoint = vertex;
        point = this.vertexSnapPoint;
      } else {
        // No vertex snap: try edge snap
        const edge = getClosestEdgeSnap(point, 15, this.elements);
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
      this.currentSegmentLength = dist(lastPoint, this.cursorPosition);
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
      this.rederiveAllWalls();
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
    this.rederiveAllWalls();
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
        if (dist(point, pts[i]) >= SNAP) continue;

        const isClosed =
          pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) <= 2;

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
          this.rederiveAllWalls();
          event.stopPropagation();
          return;
        }

        this.updateWallDerived(el);
        this.elements = [...this.elements];
        this.rederiveAllWalls();
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
          const segDist = distToSegment(point, p1, p2);
          if (segDist < 10) {
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
          this.rederiveAllWalls();
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
        this.rederiveAllWalls();
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
