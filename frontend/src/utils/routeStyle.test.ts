import { describe, expect, it } from 'vitest';
import { RISK_COLORS } from './areaColors';
import { ROUTE_VERDICTS, detourText, riskAvoided } from './routeStyle';

describe('route verdicts', () => {
  it('use the risk-tier colours: green when safe, yellow when only reduced, red when unavoidable', () => {
    expect(ROUTE_VERDICTS.clear.color).toBe(RISK_COLORS.Low);
    expect(ROUTE_VERDICTS.safe.color).toBe(RISK_COLORS.Low);
    expect(ROUTE_VERDICTS.reduced.color).toBe(RISK_COLORS.Medium);
    expect(ROUTE_VERDICTS.unavoidable.color).toBe(RISK_COLORS.High);
  });
});

describe('detourText', () => {
  it('shows the extra distance and time, or says the road is the same', () => {
    expect(detourText({ km: 16.2, minutes: 40 }, { km: 19.6, minutes: 52 })).toBe('+3.4 km, +12 menit dibanding rute tercepat');
    expect(detourText({ km: 10, minutes: 20 }, { km: 10, minutes: 20 })).toBe('sama dengan rute tercepat');
  });
});

describe('riskAvoided', () => {
  it('reports the high-risk km and flood points the recommended route avoids', () => {
    expect(riskAvoided({ high_km: 1.04, flood_points: 2 }, { high_km: 0, flood_points: 0 })).toEqual({ highKm: 1, floodPoints: 2 });
    expect(riskAvoided({ high_km: 2.2, flood_points: 0 }, { high_km: 1.1, flood_points: 0 })).toEqual({ highKm: 1.1, floodPoints: 0 });
  });

  it('is zero when nothing is avoided, never negative', () => {
    expect(riskAvoided({ high_km: 0, flood_points: 0 }, { high_km: 0, flood_points: 0 })).toEqual({ highKm: 0, floodPoints: 0 });
    expect(riskAvoided({ high_km: 1, flood_points: 0 }, { high_km: 3, flood_points: 1 })).toEqual({ highKm: 0, floodPoints: 0 });
  });
});
