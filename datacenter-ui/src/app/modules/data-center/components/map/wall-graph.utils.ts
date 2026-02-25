import { MapElement, Point, Room } from './map.types';

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
      // Geometric centroid of the polygon (area-weighted, standard shoelace formula)
      let cxSum = 0, cySum = 0;
      for (let i = 0; i < face.length; i++) {
        const j = (i + 1) % face.length;
        const cross =
          pts[face[i]].x * pts[face[j]].y - pts[face[j]].x * pts[face[i]].y;
        cxSum += (pts[face[i]].x + pts[face[j]].x) * cross;
        cySum += (pts[face[i]].y + pts[face[j]].y) * cross;
      }
      const cx = cxSum / (6 * sa);
      const cy = cySum / (6 * sa);
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
