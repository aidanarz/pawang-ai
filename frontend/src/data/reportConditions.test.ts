import { describe, expect, it } from 'vitest';
import type { GeoJSONGridFeature } from './types';
import { REPORT_CONDITIONS, featureCenter, timeAgo } from './reportConditions';
import { RISK_COLORS } from '@/utils/areaColors';

describe('report conditions', () => {
  it('use the same colours as the risk tiers, green to red', () => {
    expect(REPORT_CONDITIONS.map((c) => c.color)).toEqual([
      RISK_COLORS.Low,
      RISK_COLORS.Medium,
      RISK_COLORS['Medium-High'],
      RISK_COLORS.High,
    ]);
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  it('says minutes, then hours', () => {
    expect(timeAgo('2026-11-18T11:59:50Z', now)).toBe('baru saja');
    expect(timeAgo('2026-11-18T11:30:00Z', now)).toBe('30 menit lalu');
    expect(timeAgo('2026-11-18T09:00:00Z', now)).toBe('3 jam lalu');
  });
});

describe('featureCenter', () => {
  it('returns [lat, lng] of the middle of the area', () => {
    const f = {
      geometry: { type: 'Polygon', coordinates: [[[106.8, -6.2], [106.84, -6.2], [106.84, -6.16], [106.8, -6.16]]] },
    } as unknown as GeoJSONGridFeature;
    const [lat, lng] = featureCenter(f);
    expect(lat).toBeCloseTo(-6.18);
    expect(lng).toBeCloseTo(106.82);
  });
});
