export interface PanelTab {
  id: string;
  label: string;
  /** Optional i18n key — when present, overrides label in the UI */
  labelKey?: string;
  type:
    | 'home'
    | 'assets'
    | 'vendors'
    | 'models'
    | 'components'
    | 'racks'
    | 'room'
    | 'rack'
    | 'admin'
    | 'change-password';
  roomId?: number;
  rackName?: string;
  /** Pinned tabs are always visible and cannot be closed */
  pinned: boolean;
}
