import { EdgeSnap, MapElement, Point } from './map.types';
import {
  dist,
  distToSegment,
  lineSegmentIntersection,
} from './map-geometry.utils';

// ─── Snap helpers ─────────────────────────────────────────────────────────────

/**
 * Find the closest vertex (any point of any wall) to `point` within `tolerance`.
 * Also searches within `activePolylinePoints` (excluding its last point, which is
 * the one currently being placed).
 */
export function getClosestVertex(
  point: Point,
  tolerance: number,
  elements: MapElement[],
  activePolylinePoints: Point[] = [],
): Point | null {
  let best: Point | null = null;
  let min = tolerance;

  const check = (p: Point) => {
    const d = dist(point, p);
    if (d < min) {
      min = d;
      best = p;
    }
  };

  for (const el of elements) {
    if (el.type === 'wall' && el.points) {
      for (const p of el.points) check(p);
    }
  }

  // Can snap to start of active polyline (to close loop), but not its last point
  const len = activePolylinePoints.length;
  for (let i = 0; i < len - 1; i++) {
    check(activePolylinePoints[i]);
  }

  return best;
}

/**
 * Find the closest point on any wall segment to `point`, within `tolerance`.
 * Returns null when nothing is close enough or when the projection would land
 * virtually on an existing vertex (vertex snap handles those cases).
 */
export function getClosestEdgeSnap(
  point: Point,
  tolerance: number,
  elements: MapElement[],
): EdgeSnap | null {
  let best: EdgeSnap | null = null;
  let minDist = tolerance;

  for (const el of elements) {
    if (el.type !== 'wall' || !el.points || el.points.length < 2) continue;
    for (let i = 0; i < el.points.length - 1; i++) {
      const p1 = el.points[i];
      const p2 = el.points[i + 1];
      const d = distToSegment(point, p1, p2);
      if (d >= minDist) continue;
      const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
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
      // Skip if projection coincides with an endpoint (vertex snap handles those)
      if (t < 0.01 || t > 0.99) continue;
      minDist = d;
      best = {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
        elementId: el.id,
        segIndex: i,
      };
    }
  }
  return best;
}

/**
 * Find the first intersection between the segment [lastActivePoint → currentPoint]
 * and any existing wall segment (or previous segment of the active polyline).
 * Returns the intersection point closest to `lastActivePoint`, or null if none.
 */
export function checkIntersections(
  currentPoint: Point,
  activePolylinePoints: Point[],
  elements: MapElement[],
): Point | null {
  if (activePolylinePoints.length === 0) return null;

  const lastPoint = activePolylinePoints[activePolylinePoints.length - 1];
  let closest: Point | null = null;
  let minDist = Infinity;

  const trySegment = (p1: Point, p2: Point) => {
    if (
      (p1.x === lastPoint.x && p1.y === lastPoint.y) ||
      (p2.x === lastPoint.x && p2.y === lastPoint.y)
    )
      return;
    const hit = lineSegmentIntersection(lastPoint, currentPoint, p1, p2);
    if (hit) {
      const d = dist(lastPoint, hit);
      if (d < minDist && d > 1) {
        minDist = d;
        closest = hit;
      }
    }
  };

  for (const el of elements) {
    if (el.type === 'wall' && el.points && el.points.length > 1) {
      for (let i = 0; i < el.points.length - 1; i++) {
        trySegment(el.points[i], el.points[i + 1]);
      }
    }
  }

  if (activePolylinePoints.length > 2) {
    for (let i = 0; i < activePolylinePoints.length - 2; i++) {
      trySegment(activePolylinePoints[i], activePolylinePoints[i + 1]);
    }
  }

  return closest;
}
