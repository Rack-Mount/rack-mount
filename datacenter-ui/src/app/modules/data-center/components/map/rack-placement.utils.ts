import { MapElement, Point } from './map.types';
import { RoomFace } from './wall-graph.utils';

// ─── Rack corners ─────────────────────────────────────────────────────────────

/**
 * Returns the 4 world-space corners of a rack rectangle after applying its
 * rotation around the centre (x + w/2, y + h/2).
 *   order: TL, TR, BR, BL
 */
export function getRackCorners(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
): Point[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return (
    [
      { x: x, y: y },
      { x: x + w, y: y },
      { x: x + w, y: y + h },
      { x: x, y: y + h },
    ] as Point[]
  ).map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Ray-casting point-in-polygon, using a face index array into pts[]. */
function pointInFace(
  px: number,
  py: number,
  pts: Point[],
  face: number[],
): boolean {
  let inside = false;
  for (let i = 0, j = face.length - 1; i < face.length; j = i++) {
    const ax = pts[face[j]].x,
      ay = pts[face[j]].y;
    const bx = pts[face[i]].x,
      by = pts[face[i]].y;
    if (by > py !== ay > py && px < ((ax - bx) * (py - by)) / (ay - by) + bx)
      inside = !inside;
  }
  return inside;
}

/** Signed area of the triangle (o→a, o→b) — positive means CCW in Y-up space. */
function cross2d(
  ox: number,
  oy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

/**
 * True if open segments [a,b] and [c,d] properly intersect (endpoints excluded).
 * Uses the standard CCW sign-change test.
 */
function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = cross2d(cx, cy, dx, dy, ax, ay);
  const d2 = cross2d(cx, cy, dx, dy, bx, by);
  const d3 = cross2d(ax, ay, bx, by, cx, cy);
  const d4 = cross2d(ax, ay, bx, by, dx, dy);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

// ─── Placement validation ─────────────────────────────────────────────────────

/**
 * Returns `true` when the rotated rack at (x, y, w, h, rotation°) may be
 * placed at the requested position.
 *
 * Rules:
 *  1. When no enclosed rooms exist yet, placement is unrestricted.
 *  2. All 4 rotated corners must lie inside the *same* room polygon.
 *  3. No rack edge may properly cross any wall segment.
 *
 * The third rule catches U-shaped or L-shaped rooms where the corners of a
 * large rack could all lie inside the room while the rack body crosses an
 * inner recess wall.
 */
export function isRackPlacementValid(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  roomFaces: RoomFace[],
  elements: MapElement[],
): boolean {
  if (roomFaces.length === 0) return true; // no enclosed rooms yet → unrestricted

  const corners = getRackCorners(x, y, w, h, rotation);

  // 1. Find which room (if any) contains the first corner
  let roomIdx = -1;
  for (let r = 0; r < roomFaces.length; r++) {
    const { pts, face } = roomFaces[r];
    if (pointInFace(corners[0].x, corners[0].y, pts, face)) {
      roomIdx = r;
      break;
    }
  }
  if (roomIdx === -1) return false; // first corner outside all rooms

  // 2. Remaining corners must lie in the same room
  const { pts, face } = roomFaces[roomIdx];
  for (let i = 1; i < corners.length; i++) {
    if (!pointInFace(corners[i].x, corners[i].y, pts, face)) return false;
  }

  // 3. No rack edge may cross any wall segment
  const rackEdges: [number, number, number, number][] = [
    [corners[0].x, corners[0].y, corners[1].x, corners[1].y],
    [corners[1].x, corners[1].y, corners[2].x, corners[2].y],
    [corners[2].x, corners[2].y, corners[3].x, corners[3].y],
    [corners[3].x, corners[3].y, corners[0].x, corners[0].y],
  ];

  for (const el of elements) {
    if (el.type !== 'wall' || !el.points || el.points.length < 2) continue;
    for (let i = 0; i < el.points.length - 1; i++) {
      const wx1 = el.points[i].x,
        wy1 = el.points[i].y;
      const wx2 = el.points[i + 1].x,
        wy2 = el.points[i + 1].y;
      for (const [rx1, ry1, rx2, ry2] of rackEdges) {
        if (segmentsIntersect(rx1, ry1, rx2, ry2, wx1, wy1, wx2, wy2))
          return false;
      }
    }
  }

  return true;
}
