import { RackUnit } from '../../core/api/v1';

export interface RackRender {
  device?: RackUnit;
  rack_unit?: number;
  position?: number;
  visible?: boolean;
}
