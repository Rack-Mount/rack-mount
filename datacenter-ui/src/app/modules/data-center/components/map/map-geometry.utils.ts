import { Point } from './map.types';

/** Euclidean distance between two points. */
export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Minimum distance from point `p` to segment `v`–`w`. */
export function distToSegment(p: Point, v: Point, w: Point): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return dist(p, v);
  const t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
  return dist(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

/** Project `p` onto segment `p1`–`p2`; returns the projected point and parameter `t ∈ [0,1]`. */
export function projectOnSegment(p: Point, p1: Point, p2: Point): { pt: Point; t: number } {
  const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
  if (l2 === 0) return { pt: p1, t: 0 };
  const t = Math.max(0, Math.min(1, ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2));
  return { pt: { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }, t };
}

/**
 * Interior angle (0–180°) at vertex `p2` formed by the path p1 → p2 → p3.
 */
export function angleBetween(p1: Point, p2: Point, p3: Point): number {
  const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
  const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
  let angle = (a2 - a1) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  if (angle > 180) angle = 360 - angle;
  return angle;
}

/**
 * Intersection of segments p1–p2 and p3–p4.
 * Returns null when parallel or intersection is outside either segment.
 */
export function lineSegmentIntersection(
  p1: Point, p2: Point,
  p3: Point, p4: Point,
): Point | null {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (denom === 0) return null;
  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;
  const EPS = 0.001;
  if (ua < -EPS || ua > 1 + EPS || ub < -EPS || ub > 1 + EPS) return null;
  return { x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y) };
}

/**
 * Clamp `value` between `lo` and `hi`.
 */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
