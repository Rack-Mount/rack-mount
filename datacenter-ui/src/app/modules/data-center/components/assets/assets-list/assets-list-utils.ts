import { Asset } from '../../../../core/api/v1';

export type ListState =
  | { status: 'loading' }
  | { status: 'loaded'; results: Asset[]; count: number }
  | { status: 'error' };

export type EditState = 'idle' | 'saving' | 'error';

export const PAGE_SIZE = 25;

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
