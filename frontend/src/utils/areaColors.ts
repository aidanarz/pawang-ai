import type { GeoJSONGridFeature } from '@/data/types';

/** Same colour stops as the legend bar in HeatmapLegend (position 0..1 -> colour). */
export const COLOR_STOPS: Array<[number, string]> = [
  [0, '#22C55E'],
  [0.22, '#84CC16'],
  [0.44, '#EAB308'],
  [0.58, '#FACC15'],
  [0.74, '#F97316'],
  [0.88, '#EF4444'],
  [1, '#B91C1C'],
];

const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Colour at a position (0..1) on the legend scale, interpolated between the stops. */
export function colorAtPosition(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [p1, c1] = COLOR_STOPS[i];
    if (x <= p1) {
      const [p0, c0] = COLOR_STOPS[i - 1];
      const k = p1 === p0 ? 0 : (x - p0) / (p1 - p0);
      const a = channels(c0);
      const b = channels(c1);
      return '#' + a.map((v, j) => Math.round(v + (b[j] - v) * k).toString(16).padStart(2, '0')).join('');
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1][1];
}

export interface ColoredArea {
  feature: GeoJSONGridFeature;
  color: string;
  /** 0 = lowest probability on screen, 1 = highest. */
  relative: number;
}

/**
 * One colour per area from the model's flood probability, scaled between the lowest and highest probability on
 * screen so differences stay visible when every probability is small. Each area keeps its own colour: nothing is
 * summed or blurred across neighbours. Areas without a probability (incomplete data) are left out, never drawn as
 * zero. The result is sorted from lowest to highest so the riskiest areas are drawn last, on top.
 */
export function colorAreas(features: GeoJSONGridFeature[]): ColoredArea[] {
  const usable = features.filter(
    (f) => Number.isFinite(f.properties.flood_probability) && f.geometry.coordinates[0]?.length
  );
  if (usable.length === 0) return [];
  const probs = usable.map((f) => f.properties.flood_probability);
  const lo = Math.min(...probs);
  const hi = Math.max(...probs);
  return usable
    .map((feature) => {
      const relative = hi > lo ? (feature.properties.flood_probability - lo) / (hi - lo) : 0.5;
      return { feature, relative, color: colorAtPosition(relative) };
    })
    .sort((a, b) => a.feature.properties.flood_probability - b.feature.properties.flood_probability);
}
