/** Axis-aligned bounding box for a rack element */
export interface RackRect {
  x: number;
  y: number;
  width: number;
  height: number;
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

/**
 * Returns true when two AABBs overlap.
 * Touching edges (shared boundary with zero area intersection) are NOT
 * considered overlapping, so racks placed flush against each other are valid.
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
    if (d1 < bestDxDist) { bestDxDist = d1; bestDx = oRight - x; hasDx = true; }

    // proposed.right → other.left  (place proposed flush to the left of other)
    const d2 = Math.abs(pRight - other.x);
    if (d2 < bestDxDist) { bestDxDist = d2; bestDx = other.x - pRight; hasDx = true; }

    // proposed.left alignment with other.left
    const d3 = Math.abs(x - other.x);
    if (d3 < bestDxDist) { bestDxDist = d3; bestDx = other.x - x; hasDx = true; }

    // proposed.right alignment with other.right
    const d4 = Math.abs(pRight - oRight);
    if (d4 < bestDxDist) { bestDxDist = d4; bestDx = oRight - pRight; hasDx = true; }

    // ── Y-axis snaps ─────────────────────────────────────────────────────────
    // proposed.top → other.bottom  (place proposed flush below other)
    const d5 = Math.abs(y - oBottom);
    if (d5 < bestDyDist) { bestDyDist = d5; bestDy = oBottom - y; hasDy = true; }

    // proposed.bottom → other.top  (place proposed flush above other)
    const d6 = Math.abs(pBottom - other.y);
    if (d6 < bestDyDist) { bestDyDist = d6; bestDy = other.y - pBottom; hasDy = true; }

    // proposed.top alignment with other.top
    const d7 = Math.abs(y - other.y);
    if (d7 < bestDyDist) { bestDyDist = d7; bestDy = other.y - y; hasDy = true; }

    // proposed.bottom alignment with other.bottom
    const d8 = Math.abs(pBottom - oBottom);
    if (d8 < bestDyDist) { bestDyDist = d8; bestDy = oBottom - pBottom; hasDy = true; }
  }

  if (hasDx) x += bestDx;
  if (hasDy) y += bestDy;

  const snapped = hasDx || hasDy;

  // Collision check at the final snapped position
  const finalRect: RackRect = { x, y, width: proposed.width, height: proposed.height };
  const blocked = others.some((other) => rectsOverlap(finalRect, other));

  return { x, y, snapped, blocked };
}
