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
    | 'options'
    | 'asset'
    | 'rack-models'
    | 'locations'
    | 'asset-settings'
    | 'warehouse';
  roomId?: number;
  rackName?: string;
  /** ID of the asset — used when type === 'asset' */
  assetId?: number;
  /** Pinned tabs are always visible and cannot be closed */
  pinned: boolean;
}
