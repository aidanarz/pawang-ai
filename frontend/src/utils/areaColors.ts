import type { GeoJSONGridFeature, RiskLevel } from '@/data/types';

/** One colour per risk tier. Same colours in the map, the legend and the sidebar. Medium is never green. */
export const RISK_COLORS: Partial<Record<RiskLevel, string>> = {
  Low: '#22C55E',
  Medium: '#EAB308',
  'Medium-High': '#F97316',
  High: '#EF4444',
  Extreme: '#B91C1C',
};

export interface ColoredArea {
  feature: GeoJSONGridFeature;
  color: string;
  /** Normal fill, or a quartile shade inside the dominant tier (see dominantTier). */
  fillOpacity: number;
}

const BASE_OPACITY = 0.55;
const QUARTILE_OPACITY = [0.3, 0.45, 0.62, 0.8]; // lightest to darkest, lowest to highest probability in the tier
/** Share of areas in one tier at which the map adds a shade inside that tier. */
export const DOMINANT_SHARE = 0.75;

const usable = (features: GeoJSONGridFeature[]) =>
  features.filter(
    (f) =>
      Number.isFinite(f.properties.flood_probability) &&
      f.geometry.coordinates[0]?.length &&
      RISK_COLORS[f.properties.risk_level]
  );

/**
 * The tier that holds at least DOMINANT_SHARE of the areas on screen, or null. On such days the tier colours alone
 * show almost nothing, so the map shades the areas of that tier by quartile. The colour (the tier) never changes.
 */
export function dominantTier(features: GeoJSONGridFeature[]): RiskLevel | null {
  const list = usable(features);
  if (list.length === 0) return null;
  const counts = new Map<RiskLevel, number>();
  list.forEach((f) => counts.set(f.properties.risk_level, (counts.get(f.properties.risk_level) ?? 0) + 1));
  const [tier, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return n / list.length >= DOMINANT_SHARE ? tier : null;
}

/**
 * One colour per area from its risk tier, which comes from the model's flood probability. Each area keeps its own
 * colour: nothing is summed or blurred across neighbours. Areas without a probability or a tier (incomplete data)
 * are left out, never drawn as low. The result is sorted from lowest to highest probability so the riskiest areas
 * are drawn last, on top.
 */
export function colorAreas(features: GeoJSONGridFeature[]): ColoredArea[] {
  const sorted = usable(features).sort((a, b) => a.properties.flood_probability - b.properties.flood_probability);
  const dominant = dominantTier(features);
  const inTier = sorted.filter((f) => f.properties.risk_level === dominant);
  return sorted.map((feature) => {
    const rank = inTier.indexOf(feature);
    const q = rank < 0 ? -1 : Math.min(3, Math.floor((rank / inTier.length) * 4));
    return {
      feature,
      color: RISK_COLORS[feature.properties.risk_level] as string,
      fillOpacity: q < 0 ? BASE_OPACITY : QUARTILE_OPACITY[q],
    };
  });
}
