import { DoorElement, MapElement, RackElement, WallElement } from './map.types';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Returns the axis-aligned bounding box enclosing all map elements,
 * or null when the elements array is empty.
 */
export function getBoundingBox(elements: MapElement[]): BoundingBox | null {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const el of elements) {
    if (el.type === 'wall') {
      for (const p of (el as WallElement).points) {
        xs.push(p.x);
        ys.push(p.y);
      }
    } else if (el.type === 'rack') {
      const r = el as RackElement;
      xs.push(r.x, r.x + r.width);
      ys.push(r.y, r.y + r.height);
    } else if (el.type === 'door') {
      const d = el as DoorElement;
      xs.push(d.x, d.x2);
      ys.push(d.y, d.y2);
    } else {
      xs.push(el.x);
      ys.push(el.y);
    }
  }

  if (xs.length === 0) return null;

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/**
 * Translates all map elements by (dx, dy) in-place.
 * Returns a new array reference so that Angular's change detection fires.
 */
export function translateElements(
  elements: MapElement[],
  dx: number,
  dy: number,
): MapElement[] {
  for (const el of elements) {
    if (el.type === 'wall') {
      el.points = el.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      el.x += dx;
      el.y += dy;
      if (el.type === 'door') {
        el.x2 += dx;
        el.y2 += dy;
      }
    }
  }
  return [...elements];
}

/** Snaps a coordinate value to the nearest 10 cm grid line. */
export function gridSnap(v: number): number {
  return Math.round(v / 10) * 10;
}
