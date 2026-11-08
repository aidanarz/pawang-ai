import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AreaAnalysisResponse, GeoJSONGridFeature } from '@/data/types';
import { NA, fetchBackend, normalizeAnalysis, normalizeFeature } from './backend';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const feature = (props: Record<string, unknown>): GeoJSONGridFeature =>
  ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[]] } }) as unknown as GeoJSONGridFeature;

describe('normalizeFeature', () => {
  it('fills fields the backend has no source for, and keeps real values', () => {
    const out = normalizeFeature(
      feature({ grid_id: 'menteng', flood_probability: 0.05, siaga_level: null, peak_time: null, affected_roads: null })
    ).properties;
    expect(out.flood_probability).toBe(0.05);
    expect(out.siaga_level).toBe('Tidak tersedia');
    expect(out.peak_time).toBe(NA);
    expect(out.affected_roads).toEqual([]);
  });
});

describe('normalizeAnalysis', () => {
  const base = {
    grid_id: 'menteng',
    hydrograph: [
      { time: '2020-02-23', rainfall: 1, waterLevel: null, threshold: null },
      { time: '2020-02-24', rainfall: 2, waterLevel: 700, threshold: null },
      { time: '2020-02-25', rainfall: 3, waterLevel: 800, threshold: null },
    ],
    nearby_stations: [{ id: 'a', name: 'A', currentLevelCm: 1 }],
    recommendation: null,
  } as unknown as AreaAnalysisResponse;

  it('drops hydrograph points without a water level', () => {
    expect(normalizeAnalysis(base).hydrograph.map((h) => h.time)).toEqual(['2020-02-24', '2020-02-25']);
  });

  it('hides a hydrograph that has fewer than 2 usable points', () => {
    const one = { ...base, hydrograph: base.hydrograph.slice(0, 2) } as AreaAnalysisResponse;
    expect(normalizeAnalysis(one).hydrograph).toEqual([]);
  });

  it('drops stations without coordinates and fills text fields', () => {
    const out = normalizeAnalysis(base);
    expect(out.nearby_stations).toEqual([]);
    expect(out.recommendation).toBe(NA);
  });
});

describe('fetchBackend', () => {
  it('returns parsed JSON on 200 and adds PAWANG_DEMO_DATE when no date is given', async () => {
    vi.stubEnv('PAWANG_DEMO_DATE', '2020-02-25');
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) });
    vi.stubGlobal('fetch', f);
    expect(await fetchBackend('/api/v1/heatmap', new URLSearchParams({ time: '5h' }))).toEqual({
      kind: 'ok',
      data: { ok: 1 },
    });
    expect(String(f.mock.calls[0][0])).toContain('date=2020-02-25');
  });

  it('keeps an explicit date over PAWANG_DEMO_DATE', async () => {
    vi.stubEnv('PAWANG_DEMO_DATE', '2020-02-25');
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    await fetchBackend('/x', new URLSearchParams({ date: '2019-01-01' }));
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain('date=2019-01-01');
    expect(url).not.toContain('2020-02-25');
  });

  it('reports down on an unexpected status or a network error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await fetchBackend('/x', new URLSearchParams())).toEqual({ kind: 'down' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await fetchBackend('/x', new URLSearchParams())).toEqual({ kind: 'down' });
  });

  it('keeps "backend has no data" apart from "backend is down"', async () => {
    const body = { status: 'data_unavailable', message: 'no rainfall for 2030-01-01' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => body }));
    expect(await fetchBackend('/x', new URLSearchParams())).toEqual({
      kind: 'unavailable',
      message: 'no rainfall for 2030-01-01',
    });
  });
});
