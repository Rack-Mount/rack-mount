import { Rack } from '../../../../core/api/v1';
import { PaginatedListState } from '../../../../core/types/list-state.types';

export type ListState = PaginatedListState<Rack>;

export type DeleteState =
  | { id: 'none' }
  | {
      id: number | string;
      status: 'confirming' | 'deleting' | 'error' | 'conflict';
    };
