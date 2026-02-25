import { AngleLabel, MapElement, Point, WallSegment } from './map.types';
import { angleBetween, dist } from './map-geometry.utils';

// ─── Segment labels ───────────────────────────────────────────────────────────

/**
 * Compute midpoint/length/angle/label for each segment of a polyline.
 * `centroidX/Y` optionally flip the outward normal for closed polygons.
 */
export function computeWallSegments(
  points: Point[],
  zoom: number,
  centroidX?: number,
  centroidY?: number,
): WallSegment[] {
  if (points.length < 2) return [];
  const LABEL_DIST = 16 / zoom;
  return points.slice(0, -1).map((p1, i) => {
    const p2 = points[i + 1];
    const rdx = p2.x - p1.x,
      rdy = p2.y - p1.y;
    const rdlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
    const midX = (p1.x + p2.x) / 2,
      midY = (p1.y + p2.y) / 2;
    let angle = (Math.atan2(rdy, rdx) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    // Left normal as default outward direction
    let nx = -rdy / rdlen,
      ny = rdx / rdlen;
    // For closed polygons: flip if normal points toward centroid
    if (centroidX !== undefined && centroidY !== undefined) {
      if (nx * (centroidX - midX) + ny * (centroidY - midY) > 0) {
        nx = -nx;
        ny = -ny;
      }
    }
    return {
      x: midX,
      y: midY,
      length: dist(p1, p2),
      angle,
      labelX: midX + nx * LABEL_DIST,
      labelY: midY + ny * LABEL_DIST,
    };
  });
}

// ─── Angle labels ─────────────────────────────────────────────────────────────

/**
 * Compute the interior angle label at each interior vertex of a polyline.
 * Pass `centroidX/Y` to orient bisectors inward for closed polygons.
 * Pass `cursor` to include a preview point at the end while drawing.
 */
export function computeWallAngles(
  points: Point[],
  zoom: number,
  centroidX?: number,
  centroidY?: number,
  cursor?: Point,
): AngleLabel[] {
  let fullPoints = cursor ? [...points, cursor] : [...points];

  // Extend closed loop for wrap-around vertex
  if (
    fullPoints.length > 2 &&
    fullPoints[0].x === fullPoints[fullPoints.length - 1].x &&
    fullPoints[0].y === fullPoints[fullPoints.length - 1].y
  ) {
    fullPoints = [...fullPoints, fullPoints[1]];
  }

  if (fullPoints.length < 3) return [];

  const LABEL_DIST = 18 / zoom;
  const result: AngleLabel[] = [];

  for (let i = 1; i < fullPoints.length - 1; i++) {
    const p1 = fullPoints[i - 1],
      p2 = fullPoints[i],
      p3 = fullPoints[i + 1];
    const angle = angleBetween(p1, p2, p3);

    // Inward bisector for label placement
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
      } // degenerate (180°)
      else {
        bx /= bl;
        by /= bl;
      }
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

// ─── Full wall derivation ─────────────────────────────────────────────────────

/**
 * Re-compute all display data (segments, angles, area, centroid) for a wall
 * element in-place. Must be called after any change to `el.points`.
 */
export function updateWallDerived(el: MapElement, zoom: number): void {
  if (el.type !== 'wall' || !el.points) {
    el.segments = [];
    el.angles = [];
    el.area = undefined;
    el.centroidX = undefined;
    el.centroidY = undefined;
    return;
  }

  const pts = el.points;

  // ── Centroid (closed polygons only) ──
  let computedCx: number | undefined, computedCy: number | undefined;
  const isClosed =
    pts.length >= 4 &&
    Math.hypot(
      pts[pts.length - 1].x - pts[0].x,
      pts[pts.length - 1].y - pts[0].y,
    ) <= 2;

  if (isClosed) {
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
    if (Math.abs(sa) > 0) {
      el.area = Math.abs(sa);
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

  el.segments = computeWallSegments(pts, zoom, computedCx, computedCy);
  el.angles = computeWallAngles(pts, zoom, computedCx, computedCy);
}
