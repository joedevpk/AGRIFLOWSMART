import type { SoilType } from '@/lib/agri/crops';
import type { WaterAccess } from '@/lib/agri/suitability';

export type AreaUnit = 'm2' | 'are' | 'ha';
export type PlotStatus = 'planned' | 'preparing' | 'growing' | 'harvested' | 'resting';

export interface Plot {
  id: string;
  user_id: string;
  name: string;
  zone_id: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  area_value: number;
  area_unit: AreaUnit;
  current_crop: string | null;
  planned_crop: string | null;
  start_date: string | null;
  status: PlotStatus;
  water_access: WaterAccess;
  soil_type: SoilType | null;
  soil_ph: number | null;
  planned_quantity: number | null;
  planned_unit: string;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PlotNote {
  id: string;
  user_id: string;
  plot_id: string;
  body: string;
  created_at: string;
}

/** Conseil agricole administrable, rattaché à une culture (voir crops.ts) — ajouté par un administrateur. */
export interface CropTip {
  id: string;
  crop_id: string;
  title: string;
  body: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = { m2: 'm²', are: 'are (100 m²)', ha: 'hectare' };
export const PLOT_STATUS_LABELS: Record<PlotStatus, string> = {
  planned: 'Planifiée', preparing: 'En préparation', growing: 'En culture', harvested: 'Récoltée', resting: 'En repos',
};
