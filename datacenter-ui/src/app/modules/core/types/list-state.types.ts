/**
 * Shared paginated-list state type.
 *
 * Usage:
 *   protected readonly listState = signal<PaginatedListState<Vendor>>({ status: 'loading' });
 */
export type PaginatedListState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; results: T[]; count: number }
  | { status: 'error' };

/** Standard form/action save states. */
export type SaveState = 'idle' | 'saving' | 'error';

/** Save state extended with 'in_use' for entities that can be referenced. */
export type DestroyableState = SaveState | 'in_use';
