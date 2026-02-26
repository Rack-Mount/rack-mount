/** Axis-aligned bounding box for a rack element */
export interface RackRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Oriented bounding box (OBB) — the true rotated footprint of a rack. */
export interface ObbRect {
  x: number;       // top-left corner (before rotation)
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees, pivot = centre
}

export interface RackSnapResult {
  /** Snapped X position */
  x: number;
  /** Snapped Y position */
  y: number;
  /** Whether any snap was applied */
  snapped: boolean;
  /** Whether the final (snapped) position overlaps any existing rack */
  blocked: boolean;
}

// ─── SAT OBB collision ────────────────────────────────────────────────────────

/** Returns the 4 world-space corners of an OBB. */
function getObbCorners(o: ObbRect): [number, number][] {
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  const hw = o.width / 2;
  const hh = o.height / 2;
  const cos = Math.cos((o.rotation * Math.PI) / 180);
  const sin = Math.sin((o.rotation * Math.PI) / 180);
  // local (±hw, ±hh) → world via: x = cx + lx·cos − ly·sin, y = cy + lx·sin + ly·cos
  return [
    [cx - hw * cos + hh * sin, cy - hw * sin - hh * cos], // TL
    [cx + hw * cos + hh * sin, cy + hw * sin - hh * cos], // TR
    [cx + hw * cos - hh * sin, cy + hw * sin + hh * cos], // BR
    [cx - hw * cos - hh * sin, cy - hw * sin + hh * cos], // BL
  ];
}

/** Scalar projection interval of corners onto an axis (not normalised — safe for SAT). */
function projectObb(
  corners: [number, number][],
  ax: number,
  ay: number,
): [number, number] {
  let min = Infinity,
    max = -Infinity;
  for (const [cx, cy] of corners) {
    const p = cx * ax + cy * ay;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

/**
 * Returns true when two OBBs overlap (Separating Axis Theorem, 4 axes).
 * Racks that share an edge but have zero area intersection are NOT considered
 * overlapping (flush placement is valid).
 */
export function obbsOverlap(a: ObbRect, b: ObbRect): boolean {
  const ca = getObbCorners(a);
  const cb = getObbCorners(b);
  // 4 axes to test: local X and Y of each OBB (edge normals)
  const radA = (a.rotation * Math.PI) / 180;
  const radB = (b.rotation * Math.PI) / 180;
  const axes: [number, number][] = [
    [Math.cos(radA), Math.sin(radA)],   // A local-X
    [-Math.sin(radA), Math.cos(radA)],  // A local-Y
    [Math.cos(radB), Math.sin(radB)],   // B local-X
    [-Math.sin(radB), Math.cos(radB)],  // B local-Y
  ];
  for (const [ax, ay] of axes) {
    const [aMin, aMax] = projectObb(ca, ax, ay);
    const [bMin, bMax] = projectObb(cb, ax, ay);
    // Strict comparison: touching boundaries are allowed
    if (aMax <= bMin || bMax <= aMin) return false; // separating axis found
  }
  return true; // no separating axis → overlap
}

/**
 * Returns true when `proposed` overlaps any OBB in `others`.
 */
export function isObbBlocked(proposed: ObbRect, others: ObbRect[]): boolean {
  return others.some((o) => obbsOverlap(proposed, o));
}

// ─── AABB helpers (kept for snap-edge calculation) ─────────────────────────

/**
 * Returns true when two AABBs overlap.
 * Touching edges are NOT considered overlapping.
 */
export function rectsOverlap(a: RackRect, b: RackRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Apply magnetic snap to the proposed rack position relative to all other
 * racks, then check whether the snapped position overlaps any of them.
 *
 * Snap rules (X and Y axes are independent):
 *  - adjacency snaps: proposed.left ↔ other.right, proposed.right ↔ other.left
 *  - alignment snaps: proposed.left ↔ other.left, proposed.right ↔ other.right
 *  - same for top/bottom on the Y axis
 *
 * The nearest edge pairing within `snapRadius` (SVG units) wins for each axis.
 *
 * @param proposed    The rack being placed or moved.
 * @param others      All other racks (must already exclude the one being moved).
 * @param snapRadius  SVG-coordinate snap distance (typically SNAP_CONST / zoom).
 */
export function getRackSnapResult(
  proposed: RackRect,
  others: RackRect[],
  snapRadius: number,
): RackSnapResult {
  let x = proposed.x;
  let y = proposed.y;

  let bestDxDist = snapRadius;
  let bestDyDist = snapRadius;
  let bestDx = 0;
  let bestDy = 0;
  let hasDx = false;
  let hasDy = false;

  for (const other of others) {
    const pRight = x + proposed.width;
    const pBottom = y + proposed.height;
    const oRight = other.x + other.width;
    const oBottom = other.y + other.height;

    // ── X-axis snaps ─────────────────────────────────────────────────────────
    // proposed.left → other.right  (place proposed flush to the right of other)
    const d1 = Math.abs(x - oRight);
    if (d1 < bestDxDist) {
      bestDxDist = d1;
      bestDx = oRight - x;
      hasDx = true;
    }

    // proposed.right → other.left  (place proposed flush to the left of other)
    const d2 = Math.abs(pRight - other.x);
    if (d2 < bestDxDist) {
      bestDxDist = d2;
      bestDx = other.x - pRight;
      hasDx = true;
    }

    // proposed.left alignment with other.left
    const d3 = Math.abs(x - other.x);
    if (d3 < bestDxDist) {
      bestDxDist = d3;
      bestDx = other.x - x;
      hasDx = true;
    }

    // proposed.right alignment with other.right
    const d4 = Math.abs(pRight - oRight);
    if (d4 < bestDxDist) {
      bestDxDist = d4;
      bestDx = oRight - pRight;
      hasDx = true;
    }

    // ── Y-axis snaps ─────────────────────────────────────────────────────────
    // proposed.top → other.bottom  (place proposed flush below other)
    const d5 = Math.abs(y - oBottom);
    if (d5 < bestDyDist) {
      bestDyDist = d5;
      bestDy = oBottom - y;
      hasDy = true;
    }

    // proposed.bottom → other.top  (place proposed flush above other)
    const d6 = Math.abs(pBottom - other.y);
    if (d6 < bestDyDist) {
      bestDyDist = d6;
      bestDy = other.y - pBottom;
      hasDy = true;
    }

    // proposed.top alignment with other.top
    const d7 = Math.abs(y - other.y);
    if (d7 < bestDyDist) {
      bestDyDist = d7;
      bestDy = other.y - y;
      hasDy = true;
    }

    // proposed.bottom alignment with other.bottom
    const d8 = Math.abs(pBottom - oBottom);
    if (d8 < bestDyDist) {
      bestDyDist = d8;
      bestDy = oBottom - pBottom;
      hasDy = true;
    }
  }

  if (hasDx) x += bestDx;
  if (hasDy) y += bestDy;

  const snapped = hasDx || hasDy;

  // Collision check at the final snapped position
  const finalRect: RackRect = {
    x,
    y,
    width: proposed.width,
    height: proposed.height,
  };
  const blocked = others.some((other) => rectsOverlap(finalRect, other));

  return { x, y, snapped, blocked };
}
