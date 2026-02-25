import { MapElement, Point, Room } from './map.types';

// ─── Polylabel ────────────────────────────────────────────────────────────────

/** [cx, cy, halfSize, signedDist, upperBound] */
type Cell = [number, number, number, number, number];

const SQRT2 = Math.SQRT2;

/** Signed distance from (px,py) to the boundary of a face (positive = inside). */
function signedDistToFace(px: number, py: number, pts: Point[], face: number[]): number {
  let inside = false;
  let minD = Infinity;
  for (let i = 0, j = face.length - 1; i < face.length; j = i++) {
    const ax = pts[face[j]].x, ay = pts[face[j]].y;
    const bx = pts[face[i]].x, by = pts[face[i]].y;
    if ((by > py) !== (ay > py) && px < ((ax - bx) * (py - by)) / (ay - by) + bx)
      inside = !inside;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const ex = px - ax - t * dx, ey = py - ay - t * dy;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d < minD) minD = d;
  }
  return inside ? minD : -minD;
}

function makeCell(cx: number, cy: number, h: number, pts: Point[], face: number[]): Cell {
  const d = signedDistToFace(cx, cy, pts, face);
  return [cx, cy, h, d, d + h * SQRT2];
}

/** Max-heap push by cell[4] (upper bound). */
function heapPush(heap: Cell[], cell: Cell): void {
  heap.push(cell);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent][4] >= heap[i][4]) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

/** Max-heap pop by cell[4]. */
function heapPop(heap: Cell[]): Cell {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let best = i;
      if (l < heap.length && heap[l][4] > heap[best][4]) best = l;
      if (r < heap.length && heap[r][4] > heap[best][4]) best = r;
      if (best === i) break;
      [heap[i], heap[best]] = [heap[best], heap[i]];
      i = best;
    }
  }
  return top;
}

/**
 * Polylabel — iterative cell-refinement algorithm to find the interior point
 * farthest from all polygon edges (pole of inaccessibility).
 * Converges to 1px precision.
 */
function polylabel(pts: Point[], face: number[]): { cx: number; cy: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const vi of face) {
    if (pts[vi].x < minX) minX = pts[vi].x;
    if (pts[vi].x > maxX) maxX = pts[vi].x;
    if (pts[vi].y < minY) minY = pts[vi].y;
    if (pts[vi].y > maxY) maxY = pts[vi].y;
  }
  const width = maxX - minX, height = maxY - minY;
  const cellSize = Math.max(width, height);
  if (cellSize === 0) return { cx: minX, cy: minY };

  const heap: Cell[] = [];
  let h = cellSize / 2;
  for (let x = minX; x < maxX; x += cellSize)
    for (let y = minY; y < maxY; y += cellSize)
      heapPush(heap, makeCell(x + h, y + h, h, pts, face));

  let bestD = -Infinity, bestCx = minX + width / 2, bestCy = minY + height / 2;
  const centCell = makeCell(bestCx, bestCy, 0, pts, face);
  if (centCell[3] > bestD) { bestD = centCell[3]; bestCx = centCell[0]; bestCy = centCell[1]; }

  const PRECISION = 1.0;
  while (heap.length > 0) {
    const cell = heapPop(heap);
    if (cell[3] > bestD) { bestD = cell[3]; bestCx = cell[0]; bestCy = cell[1]; }
    if (cell[4] - bestD <= PRECISION) continue;
    const ch = cell[2] / 2;
    heapPush(heap, makeCell(cell[0] - ch, cell[1] - ch, ch, pts, face));
    heapPush(heap, makeCell(cell[0] + ch, cell[1] - ch, ch, pts, face));
    heapPush(heap, makeCell(cell[0] - ch, cell[1] + ch, ch, pts, face));
    heapPush(heap, makeCell(cell[0] + ch, cell[1] + ch, ch, pts, face));
  }
  return { cx: bestCx, cy: bestCy };
}

// ─── Planar graph face traversal ─────────────────────────────────────────────

/**
 * Build vertex + edge tables from the wall network.
 * Close vertices (within EPS) are merged into one.
 */
function buildGraph(
  elements: MapElement[],
  EPS = 3,
): { pts: Point[]; edgeList: [number, number][] } {
  const pts: Point[] = [];
  const findOrAdd = (p: Point): number => {
    for (let i = 0; i < pts.length; i++)
      if (Math.abs(pts[i].x - p.x) < EPS && Math.abs(pts[i].y - p.y) < EPS) return i;
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

  for (const el of elements) {
    if (el.type !== 'wall' || !el.points || el.points.length < 2) continue;
    for (let i = 0; i < el.points.length - 1; i++)
      addEdge(findOrAdd(el.points[i]), findOrAdd(el.points[i + 1]));
  }
  return { pts, edgeList };
}

/**
 * Build angle-sorted adjacency lists.
 */
function buildAdjacency(pts: Point[], edgeList: [number, number][]): number[][] {
  const adj: number[][] = Array.from({ length: pts.length }, () => []);
  for (const [a, b] of edgeList) { adj[a].push(b); adj[b].push(a); }
  for (let v = 0; v < pts.length; v++) {
    adj[v].sort((a, b) => {
      const aa = Math.atan2(pts[a].y - pts[v].y, pts[a].x - pts[v].x);
      const ba = Math.atan2(pts[b].y - pts[v].y, pts[b].x - pts[v].x);
      return aa - ba;
    });
  }
  return adj;
}

/**
 * Next half-edge in the planar traversal:
 * given directed edge u→v, return next v→w with largest CCW delta from incoming angle.
 * (Screen coords Y↓: largest delta selects interior faces.)
 */
function nextHalfEdge(u: number, v: number, pts: Point[], adj: number[][]): number {
  const inAng = Math.atan2(pts[u].y - pts[v].y, pts[u].x - pts[v].x);
  let best = -1, bestDelta = -Infinity;
  for (const w of adj[v]) {
    if (w === u) continue;
    const outAng = Math.atan2(pts[w].y - pts[v].y, pts[w].x - pts[v].x);
    let d = outAng - inAng;
    if (d <= 0) d += 2 * Math.PI;
    if (d > bestDelta) { bestDelta = d; best = w; }
  }
  return best;
}

/**
 * Detect all enclosed rooms as planar graph faces, returning their area
 * (in SVG units²) and the polylabel centroid.
 */
export function computeRooms(elements: MapElement[]): Room[] {
  const { pts, edgeList } = buildGraph(elements);
  if (pts.length < 3 || edgeList.length < 3) return [];

  const adj = buildAdjacency(pts, edgeList);
  const visited = new Set<string>();
  const rooms: Room[] = [];

  for (const [ea, eb] of edgeList) {
    for (const [u0, v0] of [[ea, eb], [eb, ea]] as [number, number][]) {
      if (visited.has(`${u0}|${v0}`)) continue;
      const face: number[] = [];
      let u = u0, v = v0;
      for (let step = 0; step < edgeList.length * 2 + 4; step++) {
        const key = `${u}|${v}`;
        if (visited.has(key)) break;
        visited.add(key);
        face.push(v);
        const w = nextHalfEdge(u, v, pts, adj);
        if (w === -1) break;
        u = v; v = w;
      }
      if (face.length < 3) continue;
      let sa = 0;
      for (let i = 0; i < face.length; i++) {
        const j = (i + 1) % face.length;
        sa += pts[face[i]].x * pts[face[j]].y - pts[face[j]].x * pts[face[i]].y;
      }
      sa /= 2;
      if (sa <= 0) continue; // outer face in screen coords (Y↓)
      const { cx, cy } = polylabel(pts, face);
      rooms.push({ area: sa, cx, cy });
    }
  }
  return rooms;
}

// ─── Wall merge ───────────────────────────────────────────────────────────────

/**
 * Merge two open wall polylines by joining endpoint `idxA` of `elA` to
 * endpoint `idxB` of `elB`. Returns the updated elements array (elB removed).
 * Does nothing if either wall is a closed loop or the indices are not endpoints.
 */
export function mergeWalls(
  elements: MapElement[],
  elA: MapElement,
  idxA: number,
  elB: MapElement,
  idxB: number,
): MapElement[] {
  const ptsA = elA.points!, ptsB = elB.points!;
  if (ptsA.length < 2 || ptsB.length < 2) return elements;

  const isClosed = (pts: Point[]) =>
    Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) < 2;
  if (isClosed(ptsA) || isClosed(ptsB)) return elements;

  const lastA = ptsA.length - 1, lastB = ptsB.length - 1;
  if (!((idxA === 0 || idxA === lastA) && (idxB === 0 || idxB === lastB))) return elements;

  let merged: Point[];
  if (idxA === lastA && idxB === 0)       merged = [...ptsA, ...ptsB.slice(1)];
  else if (idxA === 0   && idxB === lastB) merged = [...ptsB, ...ptsA.slice(1)];
  else if (idxA === 0   && idxB === 0)     merged = [...[...ptsA].reverse(), ...ptsB.slice(1)];
  else                                      merged = [...ptsA, ...[...ptsB].reverse().slice(1)];

  elA.points = merged;
  return elements.filter(e => e.id !== elB.id);
}
