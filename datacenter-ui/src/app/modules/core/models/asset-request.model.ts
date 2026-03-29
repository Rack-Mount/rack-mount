export type AssetRequestType = 'registration' | 'relocation' | 'maintenance' | 'decommissioning';
export type AssetRequestStatus = 'submitted' | 'planned' | 'executed' | 'rejected' | 'needs_clarification';

export interface AssetRequest {
  id: number;
  asset: number;
  asset_hostname: string;
  request_type: AssetRequestType;
  status: AssetRequestStatus;
  from_state: number | null;
  from_state_name: string | null;
  to_state: number;
  to_state_name: string;
  from_room: number | null;
  from_room_name: string | null;
  to_room: number | null;
  to_room_name: string | null;
  notes: string;
  clarification_notes: string;
  rejection_notes: string;
  planned_date: string | null;
  created_by: number;
  created_by_username: string;
  assigned_to: number | null;
  assigned_to_username: string | null;
  executed_by: number | null;
  executed_by_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetRequestCreate {
  asset: number;
  request_type: AssetRequestType;
  to_state: number;
  to_room?: number | null;
  notes?: string;
  planned_date?: string | null;
  assigned_to?: number | null;
}

export interface PaginatedAssetRequests {
  count: number;
  results: AssetRequest[];
}

/** Terminal or still active */
export function isRequestTerminal(status: AssetRequestStatus): boolean {
  return status === 'executed' || status === 'rejected';
}

/** CSS token color for request status */
export function requestStatusColor(status: AssetRequestStatus): string {
  switch (status) {
    case 'executed': return 'green';
    case 'planned': return 'blue';
    case 'submitted': return 'gray';
    case 'needs_clarification': return 'yellow';
    case 'rejected': return 'red';
    default:             return 'gray';
  }
}
