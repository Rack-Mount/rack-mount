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

/** Express an ISO date as a human-readable relative string. */
export function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'oggi';
  if (days === 1) return 'ieri';
  if (days < 30) return `${days}g fa`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}m fa`;
  return `${Math.floor(months / 12)}a fa`;
}
