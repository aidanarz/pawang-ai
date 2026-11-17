import { describe, expect, it } from 'vitest';
import type { GeoJSONGridFeature, RiskLevel } from '@/data/types';
import { RISK_COLORS, colorAreas, dominantTier } from './areaColors';

const f = (id: string, p: number | null, risk: RiskLevel): GeoJSONGridFeature =>
  ({
    type: 'Feature',
    properties: { grid_id: id, flood_probability: p, risk_level: risk },
    geometry: { type: 'Polygon', coordinates: [[[106.8, -6.2], [106.82, -6.2], [106.82, -6.18], [106.8, -6.2]]] },
  }) as unknown as GeoJSONGridFeature;

describe('colorAreas', () => {
  it('colours each area by its risk tier: green, yellow, orange, red', () => {
    const out = colorAreas([
      f('h', 0.05, 'High'),
      f('l', 0.004, 'Low'),
      f('mh', 0.025, 'Medium-High'),
      f('m', 0.012, 'Medium'),
    ]);
    expect(out.map((o) => [o.feature.properties.grid_id, o.color])).toEqual([
      ['l', '#22C55E'],
      ['m', '#EAB308'],
      ['mh', '#F97316'],
      ['h', '#EF4444'],
    ]); // lowest probability first, riskiest on top
  });

  it('never paints a Medium or Medium-High area green', () => {
    expect(RISK_COLORS.Medium).not.toBe(RISK_COLORS.Low);
    expect(RISK_COLORS['Medium-High']).not.toBe(RISK_COLORS.Low);
  });

  it('is not changed by neighbours (no accumulation)', () => {
    const alone = colorAreas([f('a', 0.012, 'Medium')])[0];
    const crowded = colorAreas([f('a', 0.012, 'Medium'), f('b', 0.05, 'High'), f('c', 0.001, 'Low')]).find(
      (o) => o.feature.properties.grid_id === 'a'
    );
    expect(crowded?.color).toBe(alone.color);
  });

  it('leaves out areas without a probability or a tier instead of drawing them as low', () => {
    expect(colorAreas([f('a', null, 'Low'), f('b', 0.03, 'Unknown'), f('c', 0.03, 'High')])).toHaveLength(1);
    expect(colorAreas([])).toEqual([]);
  });
});

describe('dominant tier (second layer)', () => {
  const allHigh = Array.from({ length: 8 }, (_, i) => f(`h${i}`, 0.04 + i * 0.01, 'High'));

  it('finds the tier that holds at least 75% of the areas, otherwise none', () => {
    expect(dominantTier(allHigh)).toBe('High');
    expect(dominantTier([...allHigh.slice(0, 3), f('l', 0.004, 'Low'), f('m', 0.012, 'Medium'), f('mh', 0.025, 'Medium-High')])).toBeNull();
    expect(dominantTier([])).toBeNull();
  });

  it('keeps the tier colour but shades the dominant tier by quartile, lowest to highest', () => {
    const out = colorAreas(allHigh);
    expect(new Set(out.map((o) => o.color))).toEqual(new Set([RISK_COLORS.High]));
    const op = out.map((o) => o.fillOpacity);
    expect(op).toEqual([...op].sort((a, b) => a - b)); // darker as probability rises
    expect(new Set(op).size).toBe(4);
  });

  it('uses one normal opacity when no tier dominates', () => {
    const mixed = [f('l', 0.004, 'Low'), f('m', 0.012, 'Medium'), f('mh', 0.025, 'Medium-High'), f('h', 0.05, 'High')];
    expect(new Set(colorAreas(mixed).map((o) => o.fillOpacity)).size).toBe(1);
  });
});
