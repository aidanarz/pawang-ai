import { describe, expect, it } from 'vitest';
import type { GeoJSONGridFeature } from '@/data/types';
import { colorAreas, colorAtPosition } from './areaColors';

const f = (id: string, p: number | null): GeoJSONGridFeature =>
  ({
    type: 'Feature',
    properties: { grid_id: id, flood_probability: p },
    geometry: { type: 'Polygon', coordinates: [[[106.8, -6.2], [106.82, -6.2], [106.82, -6.18], [106.8, -6.2]]] },
  }) as unknown as GeoJSONGridFeature;

describe('colorAtPosition', () => {
  it('hits the first and last legend colours and interpolates between stops', () => {
    expect(colorAtPosition(0)).toBe('#22c55e');
    expect(colorAtPosition(1)).toBe('#b91c1c');
    expect(colorAtPosition(0.22)).toBe('#84cc16');
    expect(colorAtPosition(0.11)).not.toBe(colorAtPosition(0.22));
  });

  it('clamps out-of-range positions', () => {
    expect(colorAtPosition(-3)).toBe(colorAtPosition(0));
    expect(colorAtPosition(9)).toBe(colorAtPosition(1));
  });
});

describe('colorAreas', () => {
  it('colours each area by its own probability, scaled to the lowest and highest on screen', () => {
    const out = colorAreas([f('a', 0.05), f('b', 0.01), f('c', 0.03)]);
    expect(out.map((o) => o.feature.properties.grid_id)).toEqual(['b', 'c', 'a']); // lowest first, riskiest on top
    expect(out[0].relative).toBeCloseTo(0);
    expect(out[1].relative).toBeCloseTo(0.5);
    expect(out[2].relative).toBeCloseTo(1);
    expect(out[0].color).toBe(colorAtPosition(0));
    expect(out[2].color).toBe(colorAtPosition(1));
  });

  it('is not changed by how many neighbours an area has (no accumulation)', () => {
    const alone = colorAreas([f('a', 0.07), f('z', 0.03)]).find((o) => o.feature.properties.grid_id === 'a');
    const crowded = colorAreas([f('a', 0.07), f('z', 0.03), f('n1', 0.04), f('n2', 0.05), f('n3', 0.06)]).find(
      (o) => o.feature.properties.grid_id === 'a'
    );
    expect(crowded?.color).toBe(alone?.color);
  });

  it('leaves out areas without a probability instead of drawing them as zero', () => {
    expect(colorAreas([f('a', null), f('b', 0.03)])).toHaveLength(1);
  });

  it('uses a middle colour when every probability is equal, and returns nothing for no data', () => {
    expect(colorAreas([f('a', 0.04), f('b', 0.04)])[0].relative).toBe(0.5);
    expect(colorAreas([])).toEqual([]);
  });
});
