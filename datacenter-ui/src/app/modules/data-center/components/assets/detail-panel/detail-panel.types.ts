export interface PanelTab {
  id: string;
  label: string;
  /** Optional i18n key — when present, overrides label in the UI */
  labelKey?: string;
  type: 'home' | 'assets' | 'vendors' | 'models' | 'room' | 'rack';
  roomId?: number;
  rackName?: string;
  /** Pinned tabs are always visible and cannot be closed */
  pinned: boolean;
}
