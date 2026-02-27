export interface PanelTab {
  id: string;
  label: string;
  type: 'home' | 'assets' | 'room' | 'rack';
  roomId?: number;
  rackName?: string;
  /** Pinned tabs are always visible and cannot be closed */
  pinned: boolean;
}
