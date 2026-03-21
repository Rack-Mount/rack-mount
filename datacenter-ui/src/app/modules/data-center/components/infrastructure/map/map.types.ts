export type Point = { x: number; y: number };

export interface WallSegment {
  x: number;
  y: number;
  length: number;
  angle: number;
  labelX: number;
  labelY: number;
}

export interface AngleLabel {
  x: number;
  y: number;
  angle: number;
  labelX: number;
  labelY: number;
}

export interface Room {
  area: number;
  cx: number;
  cy: number;
  name?: string;
}

export interface SnapTarget {
  elementId: string;
  pointIndex: number;
  x: number;
  y: number;
}

export interface EdgeSnap {
  x: number;
  y: number;
  elementId: string;
  segIndex: number;
}

export interface VertexRef {
  elementId: string;
  pointIndex: number;
}

// ── Discriminated union for map elements ─────────────────────────────────────
// Each element type carries only the fields that are meaningful for it.
// The `type` discriminant enables compile-time narrowing with `el.type === 'wall'`.

interface BaseElement {
  id: string;
  x: number;
  y: number;
}

export interface WallElement extends BaseElement {
  type: 'wall';
  /** Polyline vertices */
  points: Point[];
  /** Pre-computed — populated by updateWallDerived(), never persisted */
  area?: number;
  centroidX?: number;
  centroidY?: number;
  segments?: WallSegment[];
  angles?: AngleLabel[];
}

export interface RackElement extends BaseElement {
  type: 'rack';
  width: number;
  height: number;
  /** Rotation in degrees (0 / 90 / 180 / 270) */
  rotation?: number;
  /** Backend rack name this floor-plan element is linked to */
  rackName?: string;
}

export interface DoorElement extends BaseElement {
  type: 'door';
  x2: number;
  y2: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
}

/** Union of all floor-plan element types. Use `el.type` to narrow. */
export type MapElement = WallElement | RackElement | DoorElement | TextElement;

// ── Type guard helpers ────────────────────────────────────────────────────────

export function isWallElement(el: MapElement): el is WallElement {
  return el.type === 'wall';
}

export function isRackElement(el: MapElement): el is RackElement {
  return el.type === 'rack';
}

export function isDoorElement(el: MapElement): el is DoorElement {
  return el.type === 'door';
}

export function isTextElement(el: MapElement): el is TextElement {
  return el.type === 'text';
}
