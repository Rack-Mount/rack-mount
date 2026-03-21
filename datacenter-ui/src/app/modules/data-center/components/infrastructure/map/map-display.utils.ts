import { MapElement, Point } from './map.types';

/**
 * Converts a `Point[]` to the SVG `points` attribute string format
 * (`"x1,y1 x2,y2 ..."`).
 */
export function getPointsString(points: Point[] | undefined): string {
  if (!points || points.length === 0) return '';
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

/** Returns the visual length of a door element in cm (rounded integer). */
export function getDoorLength(el: MapElement): number {
  return Math.round(Math.hypot((el.x2 ?? el.x) - el.x, (el.y2 ?? el.y) - el.y));
}

/** Returns the mid-point of a door element in SVG coordinates. */
export function getDoorMidpoint(el: MapElement): Point {
  return {
    x: (el.x + (el.x2 ?? el.x)) / 2,
    y: (el.y + (el.y2 ?? el.y)) / 2,
  };
}

/**
 * Builds the SVG `d` string for a door: the main line plus perpendicular
 * end-caps.  Cap length is zoom-scaled so the caps stay a fixed screen size.
 */
export function getDoorPath(el: MapElement, zoom: number): string {
  const x1 = el.x,
    y1 = el.y;
  const x2 = el.x2 ?? el.x,
    y2 = el.y2 ?? el.y;
  const dx = x2 - x1,
    dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const capLen = 8 / zoom;
  // Perpendicular unit vector
  const nx = (-dy / len) * capLen;
  const ny = (dx / len) * capLen;
  return (
    `M ${x1 + nx} ${y1 + ny} L ${x1 - nx} ${y1 - ny} ` +
    `M ${x1} ${y1} L ${x2} ${y2} ` +
    `M ${x2 + nx} ${y2 + ny} L ${x2 - nx} ${y2 - ny}`
  );
}

/**
 * Returns the SVG `rotate()` transform string for a rack element.
 * Returns an empty string when rotation is 0 (no attribute needed).
 */
export function getRackTransform(el: MapElement): string {
  const rot = el.rotation ?? 0;
  if (rot === 0) return '';
  const cx = el.x + (el.width ?? 0) / 2;
  const cy = el.y + (el.height ?? 0) / 2;
  return `rotate(${rot},${cx},${cy})`;
}
