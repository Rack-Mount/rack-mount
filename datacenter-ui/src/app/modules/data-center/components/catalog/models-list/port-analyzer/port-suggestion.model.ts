import { PortTypeEnum } from '../../../../../core/api/v1/model/portTypeEnum';

export interface PortSuggestion {
  /** Temporary client-side identifier for tracking in the list. */
  id: string;
  port_type: PortTypeEnum;
  side: 'front' | 'rear';
  name: string;
  /** Horizontal center position as percentage 0–100. */
  pos_x: number;
  /** Vertical center position as percentage 0–100. */
  pos_y: number;
  /** Detection confidence score 0–1. */
  confidence: number;
  /** Whether the user has accepted this suggestion for import. */
  accepted: boolean;
}
