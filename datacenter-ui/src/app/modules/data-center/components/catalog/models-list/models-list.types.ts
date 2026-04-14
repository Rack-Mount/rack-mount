import type { ImageEditParams } from './image-editor/image-editor.component';

export interface ModelForm {
  name: string;
  vendor_id: number | null;
  type_id: number | null;
  rack_units: number | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  weight_kg: string;
  power_consumption_watt: number | null;
  note: string;
  front_image_file: File | null;
  rear_image_file: File | null;
  front_image_url: string | null;
  rear_image_url: string | null;
  front_transform: ImageEditParams | null;
  rear_transform: ImageEditParams | null;
  front_preview_url: string | null;
  rear_preview_url: string | null;
}

export function emptyForm(): ModelForm {
  return {
    name: '',
    vendor_id: null,
    type_id: null,
    rack_units: null,
    width_mm: null,
    height_mm: null,
    depth_mm: null,
    weight_kg: '',
    power_consumption_watt: null,
    note: '',
    front_image_file: null,
    rear_image_file: null,
    front_image_url: null,
    rear_image_url: null,
    front_transform: null,
    rear_transform: null,
    front_preview_url: null,
    rear_preview_url: null,
  };
}
