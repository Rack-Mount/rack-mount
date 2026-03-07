import { ComponentTypeEnum } from './api/v1';

/** Default page size used by catalog list components (vendors, models, components). */
export const DEFAULT_PAGE_SIZE = 50;

/** Debounce delay (ms) for search inputs across all list components. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Human-readable labels for component types, shared across list and drawer. */
export const COMPONENT_TYPE_LABELS: Record<ComponentTypeEnum, string> = {
  cable_manager: 'Passacavi / Cable Manager',
  blanking_panel: 'Pannello cieco / Blanking Panel',
  patch_panel: 'Patch Panel',
  pdu: 'PDU / Power Strip',
  shelf: 'Ripiano / Shelf',
  other: 'Altro / Other',
};
