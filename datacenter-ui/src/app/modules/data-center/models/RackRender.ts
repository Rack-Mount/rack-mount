import { RackUnit } from '../../core/api/v1';

export interface RackRender {
  /** Set when a device occupies this unit */
  device?: RackUnit;
  /** Number of rack units the device spans (1 if empty) */
  rackUnit: number;
  /** 1-based position from bottom of the rack */
  position: number;
  /** False for rows hidden behind a multi-U device */
  visible: boolean;
}
