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

export interface MapElement {
  id: string;
  type: 'wall' | 'rack' | 'door' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  /** Polyline vertices (walls only) */
  points?: Point[];
  text?: string;
  /** Pre-computed display data — populated by updateWallDerived(), never set manually */
  area?: number;
  centroidX?: number;
  centroidY?: number;
  segments?: WallSegment[];
  angles?: AngleLabel[];
}
