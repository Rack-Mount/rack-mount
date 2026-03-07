/**
 * Toggles sort ordering for a column.
 *
 * - If `field` is currently sorted ascending → returns descending (`-field`).
 * - Otherwise (descending or unsorted) → returns ascending (`field`).
 *
 * Usage:
 *   this.ordering.set(toggleSort(this.ordering(), field));
 */
export function toggleSort(current: string, field: string): string {
  return current === field ? `-${field}` : field;
}
