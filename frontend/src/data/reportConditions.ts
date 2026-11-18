import { RISK_COLORS } from '@/utils/areaColors';
import type { GeoJSONGridFeature } from './types';

export type ReportCondition = 'aman' | 'basah' | 'genangan_rendah' | 'banjir';

export interface LiveReport {
  id: string;
  lat: number;
  lon: number;
  condition: ReportCondition;
  comment: string;
  area_name: string;
  grid_id: string;
  created_at: string;
  /** Example report shipped for demos, not sent by a person. */
  demo?: boolean;
}

/** Same colours as the risk tiers on the map: green, yellow, orange, red. */
export const REPORT_CONDITIONS: Array<{ value: ReportCondition; label: string; emoji: string; color: string }> = [
  { value: 'aman', label: 'Aman, jalan kering', emoji: '🟢', color: RISK_COLORS.Low as string },
  { value: 'basah', label: 'Hujan, jalan basah', emoji: '🟡', color: RISK_COLORS.Medium as string },
  { value: 'genangan_rendah', label: 'Genangan rendah, masih bisa dilewati', emoji: '🟠', color: RISK_COLORS['Medium-High'] as string },
  { value: 'banjir', label: 'Banjir tinggi, sulit dilewati', emoji: '🔴', color: RISK_COLORS.High as string },
];

export const MAX_REPORT_COMMENT = 280;

/** Middle of an area's bounding box, as [lat, lng]. */
export function featureCenter(feature: GeoJSONGridFeature): [number, number] {
  const ring = feature.geometry.coordinates[0];
  const lats = ring.map((c) => c[1]);
  const lngs = ring.map((c) => c[0]);
  return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2];
}

export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  return `${Math.floor(min / 60)} jam lalu`;
}
