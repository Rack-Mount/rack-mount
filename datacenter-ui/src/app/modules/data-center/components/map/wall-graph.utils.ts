import { AngleLabel, MapElement, Point, Room } from './map.types';

// ─── Polylabel (pole of inaccessibility) ─────────────────────────────────────
// Finds the interior point farthest from all polygon edges.
// Used so labels never overlap walls, even in concave / L-shaped rooms.

/** [cx, cy, halfSize, signedDist, upperBound] */
type Cell = [number, number, number, number, number];
const SQRT2 = Math.SQRT2;

// ─── Rack obstacles ───────────────────────────────────────────────────────────

interface RackObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // degrees, pivot = centre
}

/** True if (px,py) falls inside the oriented rack rectangle. */
function isInsideRotatedRect(px: number, py: number, o: RackObstacle): boolean {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const dx = px - cx;
  const dy = py - cy;
  const rad = (o.rotation * Math.PI) / 180;
  const cosA = Math.cos(-rad);
  const sinA = Math.sin(-rad);
  const lx = dx * cosA - dy * sinA;
  const ly = dx * sinA + dy * cosA;
  return Math.abs(lx) <= o.w / 2 && Math.abs(ly) <= o.h / 2;
}

function isInAnyObstacle(px: number, py: number, obs: RackObstacle[]): boolean {
  return obs.some((o) => isInsideRotatedRect(px, py, o));
}

function signedDistToFace(
  px: number,
  py: number,
  pts: Point[],
  face: number[],
): number {
  let inside = false,
    minD = Infinity;
  for (let i = 0, j = face.length - 1; i < face.length; j = i++) {
    const ax = pts[face[j]].x,
      ay = pts[face[j]].y;
    const bx = pts[face[i]].x,
      by = pts[face[i]].y;
    if (by > py !== ay > py && px < ((ax - bx) * (py - by)) / (ay - by) + bx)
      inside = !inside;
    const dx = bx - ax,
      dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const ex = px - ax - t * dx,
      ey = py - ay - t * dy;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d < minD) minD = d;
  }
  return inside ? minD : -minD;
}

function makeCell(
  cx: number,
  cy: number,
  h: number,
  pts: Point[],
  face: number[],
): Cell {
  const d = signedDistToFace(cx, cy, pts, face);
  return [cx, cy, h, d, d + h * SQRT2];
}

function heapPush(heap: Cell[], cell: Cell): void {
  heap.push(cell);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p][4] >= heap[i][4]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}

function heapPop(heap: Cell[]): Cell {
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
}

/**
 * Mixed label placement:
 * - Computes the geometric centroid (true visual center of the polygon).
 * - Computes the polylabel result (point farthest from all walls).
 * - Uses the centroid if it is already well inside (≥ 60% of the polylabel
 *   clearance), so regular rooms get a perfectly centered label.
 * - Falls back to polylabel for concave / L-shaped rooms where the centroid
 *   would land on or too close to a wall.
 */
function labelPoint(
  pts: Point[],
  face: number[],
  sa: number,
  obstacles: RackObstacle[] = [],
): { cx: number; cy: number } {
  // 1. Geometric centroid (shoelace formula)
  let cxSum = 0,
    cySum = 0;
  for (let i = 0; i < face.length; i++) {
    const j = (i + 1) % face.length;
    const cross =
      pts[face[i]].x * pts[face[j]].y - pts[face[j]].x * pts[face[i]].y;
    cxSum += (pts[face[i]].x + pts[face[j]].x) * cross;
    cySum += (pts[face[i]].y + pts[face[j]].y) * cross;
  }
  const gcx = cxSum / (6 * sa);
  const gcy = cySum / (6 * sa);

  // 2. Polylabel — find the point farthest from all edges
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
  const cellSize = Math.max(maxX - minX, maxY - minY);
  if (cellSize === 0) return { cx: gcx, cy: gcy };

  const heap: Cell[] = [];
  let h = cellSize / 2;
  for (let x = minX; x < maxX; x += cellSize)
    for (let y = minY; y < maxY; y += cellSize)
      heapPush(heap, makeCell(x + h, y + h, h, pts, face));

  let bestD = -Infinity,
    bestCx = (minX + maxX) / 2,
    bestCy = (minY + maxY) / 2;
  const seed = makeCell(bestCx, bestCy, 0, pts, face);
  if (seed[3] > bestD && !isInAnyObstacle(seed[0], seed[1], obstacles)) {
    bestD = seed[3];
    bestCx = seed[0];
    bestCy = seed[1];
  }

  while (heap.length > 0) {
    const cell = heapPop(heap);
    if (cell[3] > bestD && !isInAnyObstacle(cell[0], cell[1], obstacles)) {
      bestD = cell[3];
      bestCx = cell[0];
      bestCy = cell[1];
    }
    if (cell[4] - bestD <= 1.0) continue;
    const ch = cell[2] / 2;
    heapPush(heap, makeCell(cell[0] - ch, cell[1] - ch, ch, pts, face));
    heapPush(heap, makeCell(cell[0] + ch, cell[1] - ch, ch, pts, face));
    heapPush(heap, makeCell(cell[0] - ch, cell[1] + ch, ch, pts, face));
    heapPush(heap, makeCell(cell[0] + ch, cell[1] + ch, ch, pts, face));
  }
  // bestD = max clearance from walls (polylabel result)

  // 3. Check centroid clearance
  const centDist = signedDistToFace(gcx, gcy, pts, face);

  // Use centroid if it's within 60% of the optimal clearance AND not inside a rack.
  if (centDist >= bestD * 0.6 && !isInAnyObstacle(gcx, gcy, obstacles)) {
    return { cx: gcx, cy: gcy };
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
      if (Math.abs(pts[i].x - p.x) < EPS && Math.abs(pts[i].y - p.y) < EPS)
        return i;
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
function buildAdjacency(
  pts: Point[],
  edgeList: [number, number][],
): number[][] {
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
  return adj;
}

/**
 * Next half-edge in the planar traversal:
 * given directed edge u→v, return next v→w with largest CCW delta from incoming angle.
 * (Screen coords Y↓: largest delta selects interior faces.)
 */
function nextHalfEdge(
  u: number,
  v: number,
  pts: Point[],
  adj: number[][],
): number {
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
}

/**
 * Detect all enclosed rooms as planar graph faces, returning their area
 * (in SVG units²) and the polylabel centroid.
 */
export function computeRooms(elements: MapElement[]): Room[] {
  // Extract rack geometries to use as label-placement obstacles
  const obstacles: RackObstacle[] = elements
    .filter((e) => e.type === 'rack' && e.x != null)
    .map((e) => ({
      x: e.x!,
      y: e.y!,
      w: e.width ?? 0,
      h: e.height ?? 0,
      rotation: e.rotation ?? 0,
    }));

  const { pts, edgeList } = buildGraph(elements);
  if (pts.length < 3 || edgeList.length < 3) return [];

  const adj = buildAdjacency(pts, edgeList);
  const visited = new Set<string>();
  const rooms: Room[] = [];

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
        const w = nextHalfEdge(u, v, pts, adj);
        if (w === -1) break;
        u = v;
        v = w;
      }
      if (face.length < 3) continue;
      let sa = 0;
      for (let i = 0; i < face.length; i++) {
        const j = (i + 1) % face.length;
        sa += pts[face[i]].x * pts[face[j]].y - pts[face[j]].x * pts[face[i]].y;
      }
      sa /= 2;
      if (sa <= 0) continue; // outer face in screen coords (Y↓)
      const { cx, cy } = labelPoint(pts, face, sa, obstacles);
      rooms.push({ area: sa, cx, cy });
    }
  }
  return rooms;
}

// ─── Room face polygons ───────────────────────────────────────────────────────

/**
 * Polygon descriptor for an enclosed room: the shared vertex array and the
 * ordered index list that forms the face boundary.
 */
export interface RoomFace {
  /** Flat vertex array shared by all faces from the same buildGraph call. */
  pts: Point[];
  /** Ordered vertex indices (CCW in Y↓ SVG coordinates → positive signed area). */
  face: number[];
}

/**
 * Returns the polygon vertices for every enclosed room face.
 * Useful for point-in-polygon tests (e.g. rack placement validation).
 */
export function computeRoomFaces(elements: MapElement[]): RoomFace[] {
  const { pts, edgeList } = buildGraph(elements);
  if (pts.length < 3 || edgeList.length < 3) return [];
  const adj = buildAdjacency(pts, edgeList);
  const visited = new Set<string>();
  const faces: RoomFace[] = [];

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
        const w = nextHalfEdge(u, v, pts, adj);
        if (w === -1) break;
        u = v;
        v = w;
      }
      if (face.length < 3) continue;
      let sa = 0;
      for (let i = 0; i < face.length; i++) {
        const j = (i + 1) % face.length;
        sa += pts[face[i]].x * pts[face[j]].y - pts[face[j]].x * pts[face[i]].y;
      }
      sa /= 2;
      if (sa <= 0) continue; // outer face
      faces.push({ pts, face });
    }
  }
  return faces;
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
  const ptsA = elA.points!,
    ptsB = elB.points!;
  if (ptsA.length < 2 || ptsB.length < 2) return elements;

  const isClosed = (pts: Point[]) =>
    Math.hypot(
      pts[pts.length - 1].x - pts[0].x,
      pts[pts.length - 1].y - pts[0].y,
    ) < 2;
  if (isClosed(ptsA) || isClosed(ptsB)) return elements;

  const lastA = ptsA.length - 1,
    lastB = ptsB.length - 1;
  if (!((idxA === 0 || idxA === lastA) && (idxB === 0 || idxB === lastB)))
    return elements;

  let merged: Point[];
  if (idxA === lastA && idxB === 0) merged = [...ptsA, ...ptsB.slice(1)];
  else if (idxA === 0 && idxB === lastB) merged = [...ptsB, ...ptsA.slice(1)];
  else if (idxA === 0 && idxB === 0)
    merged = [...[...ptsA].reverse(), ...ptsB.slice(1)];
  else merged = [...ptsA, ...[...ptsB].reverse().slice(1)];

  elA.points = merged;
  return elements.filter((e) => e.id !== elB.id);
}

// ─── Junction angles ──────────────────────────────────────────────────────────

/**
 * After all wall-derived data is computed, find every vertex where 2+ distinct
 * walls meet and inject the correct inter-wall angles there.
 * Removes any intra-wall angle previously computed at those junction vertices.
 * Mutates `el.angles` in-place for each affected wall element.
 */
export function computeJunctionAngles(
  elements: MapElement[],
  zoom: number,
): void {
  const EPS = 3;
  const walls = elements.filter(
    (e) => e.type === 'wall' && e.points && e.points.length >= 2,
  );

  interface Arm {
    wall: MapElement;
    neighborPt: Point;
    azimuth: number;
  }

  const junctionMap = new Map<string, { jPt: Point; arms: Arm[] }>();
  const key = (p: Point) => `${Math.round(p.x / EPS)}_${Math.round(p.y / EPS)}`;

  for (const wall of walls) {
    const pts = wall.points!;
    for (let i = 0; i < pts.length; i++) {
      const k = key(pts[i]);
      if (!junctionMap.has(k)) junctionMap.set(k, { jPt: pts[i], arms: [] });
      const entry = junctionMap.get(k)!;
      if (i > 0) {
        const nb = pts[i - 1];
        entry.arms.push({
          wall,
          neighborPt: nb,
          azimuth: Math.atan2(nb.y - pts[i].y, nb.x - pts[i].x),
        });
      }
      if (i < pts.length - 1) {
        const nb = pts[i + 1];
        entry.arms.push({
          wall,
          neighborPt: nb,
          azimuth: Math.atan2(nb.y - pts[i].y, nb.x - pts[i].x),
        });
      }
    }
  }

  const LABEL_DIST = 18 / zoom;

  for (const { jPt, arms } of junctionMap.values()) {
    const wallIds = new Set(arms.map((a) => a.wall.id));
    if (wallIds.size < 2) continue;

    // Remove intra-wall angles already computed at this vertex
    for (const id of wallIds) {
      const wall = walls.find((w) => w.id === id);
      if (wall?.angles) {
        wall.angles = wall.angles.filter(
          (a) => !(Math.abs(a.x - jPt.x) < EPS && Math.abs(a.y - jPt.y) < EPS),
        );
      }
    }

    arms.sort((a, b) => a.azimuth - b.azimuth);
    const n = arms.length;

    for (let i = 0; i < n; i++) {
      const a1 = arms[i];
      const a2 = arms[(i + 1) % n];

      let delta = a2.azimuth - a1.azimuth;
      if (delta <= 0) delta += 2 * Math.PI;
      const angleDeg = delta * (180 / Math.PI);

      if (angleDeg < 2 || Math.abs(angleDeg - 180) < 1) continue;

      const midAz = a1.azimuth + delta / 2;
      const bx = -Math.cos(midAz);
      const by = -Math.sin(midAz);

      if (!a1.wall.angles) a1.wall.angles = [];
      a1.wall.angles.push({
        x: jPt.x,
        y: jPt.y,
        angle: Math.round(angleDeg * 10) / 10,
        labelX: jPt.x + bx * LABEL_DIST,
        labelY: jPt.y + by * LABEL_DIST,
      } as AngleLabel);
    }
  }
}

// ─── Room name persistence ────────────────────────────────────────────────────

/**
 * Transfer names from `previous` rooms to `computed` rooms by nearest-centroid
 * matching.  A match is accepted when the centroid shift is within ~80% of the
 * old room's geometric radius (√area).  This keeps names stable across small
 * vertex moves.
 */
export function restoreRoomNames(computed: Room[], previous: Room[]): Room[] {
  const namedOld = previous.filter((r) => r.name);
  for (const r of computed) {
    let bestDist = Infinity;
    let bestName: string | undefined;
    for (const old of namedOld) {
      const dx = r.cx - old.cx;
      const dy = r.cy - old.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const threshold = Math.sqrt(old.area) * 0.8;
      if (d < bestDist && d < threshold) {
        bestDist = d;
        bestName = old.name;
      }
    }
    if (bestName !== undefined) r.name = bestName;
  }
  return computed;
}
