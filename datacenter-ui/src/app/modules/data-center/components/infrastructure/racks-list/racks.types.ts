import { Rack } from '../../../../core/api/v1';

export type ListState =
  | { status: 'loading' }
  | { status: 'loaded'; results: Rack[]; count: number }
  | { status: 'error' };

export type DeleteState =
  | { id: 'none' }
  | {
      id: number | string;
      status: 'confirming' | 'deleting' | 'error' | 'conflict';
    };
