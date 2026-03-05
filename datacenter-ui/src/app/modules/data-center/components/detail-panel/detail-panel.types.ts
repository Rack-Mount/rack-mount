export interface PanelTab {
  id: string;
  label: string;
  type:
    | 'home'
    | 'assets'
    | 'vendors'
    | 'models'
    | 'components'
    | 'room'
    | 'rack';
  roomId?: number;
  rackName?: string;
  /** Pinned tabs are always visible and cannot be closed */
  pinned: boolean;
}
