import { Asset } from '../../../../core/api/v1';

export type ListState =
  | { status: 'loading' }
  | { status: 'loaded'; results: Asset[]; count: number }
  | { status: 'error' };

export type EditState = 'idle' | 'saving' | 'error';

export const PAGE_SIZE = 25;

// ── Picker event types ────────────────────────────────────────────────────

export interface StatePickerOpenEvent {
  assetId: number;
  x: number;
  y: number;
}

export interface BulkPickerOpenEvent {
  x: number;
  y: number;
}

// ── Shared view helpers ───────────────────────────────────────────────────

/**
 * Mirror of the backend ALLOWED_TRANSITIONS state machine.
 * Keys and values are AssetState.code strings (standard states only).
 * If a state has no code (custom state), all transitions are allowed.
 */
export const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  in_stock:         new Set(['in_preparation', 'in_production', 'decommissioned']),
  in_preparation:   new Set(['in_stock', 'in_production', 'decommissioned']),
  in_production:    new Set(['in_maintenance', 'in_stock', 'decommissioned']),
  in_maintenance:   new Set(['in_production', 'in_stock', 'decommissioned']),
  decommissioned:   new Set(),
};

/** Map asset state name to a CSS colour token */
export function stateColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('attiv') || n.includes('activ') || n.includes('operativ'))
    return 'green';
  if (
    n.includes('manut') ||
    n.includes('maint') ||
    n.includes('riserva') ||
    n.includes('standby')
  )
    return 'yellow';
  if (
    n.includes('decomm') ||
    n.includes('guasto') ||
    n.includes('fault') ||
    n.includes('dismess')
  )
    return 'red';
  if (n.includes('install') || n.includes('transit')) return 'blue';
  return 'gray';
}

/** Format ISO date string to DD/MM/YYYY (returns '—' for empty values). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Express an ISO date as a human-readable relative string using the browser's Intl API. */
export function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (diffDays === 0) return rtf.format(0, 'day');
  if (diffDays < 30) return rtf.format(-diffDays, 'day');
  const months = Math.floor(diffDays / 30);
  if (months < 12) return rtf.format(-months, 'month');
  return rtf.format(-Math.floor(months / 12), 'year');
}
