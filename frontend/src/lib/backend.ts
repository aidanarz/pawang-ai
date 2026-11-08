import { NextResponse } from 'next/server';
import type {
  AreaAnalysisResponse,
  GeoJSONGridFeature,
  HydrographPoint,
  SiagaLevel,
} from '@/data/types';

/**
 * FastAPI backend (backend/). Set PAWANG_BACKEND_URL to change it.
 * Server-side only: the browser keeps calling the Next.js /api/v1/* routes.
 */
export const BACKEND_URL = process.env.PAWANG_BACKEND_URL ?? 'http://127.0.0.1:8000';

const TIMEOUT_MS = 20000;
export const NA = 'Belum tersedia';

/** What the backend said. 'unavailable' = it is up but has no data for the request (HTTP 503 data_unavailable). */
export type BackendResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unavailable'; message: string }
  | { kind: 'down' };

/** GET a backend path. 'down' covers a network error, a timeout and any answer other than 200 or 503. */
export async function fetchBackend<T>(path: string, params: URLSearchParams): Promise<BackendResult<T>> {
  // Backend in replay mode needs a target day. PAWANG_DEMO_DATE=YYYY-MM-DD supplies one when the UI sends none.
  const q = new URLSearchParams(params);
  if (process.env.PAWANG_DEMO_DATE && !q.has('date')) q.set('date', process.env.PAWANG_DEMO_DATE);
  try {
    const res = await fetch(`${BACKEND_URL}${path}?${q.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 503) {
      const body = await res.json().catch(() => null);
      if (body?.status === 'data_unavailable') {
        return { kind: 'unavailable', message: String(body.message ?? 'Data tidak tersedia') };
      }
    }
    if (!res.ok) {
      console.error(`Backend ${path} -> HTTP ${res.status}`);
      return { kind: 'down' };
    }
    return { kind: 'ok', data: (await res.json()) as T };
  } catch (err) {
    console.error(`Backend ${path} unreachable:`, err);
    return { kind: 'down' };
  }
}

/** Pass the backend's 'no data for this request' answer on to the browser (HTTP 503), instead of showing demo data. */
export function unavailableResponse(message: string): NextResponse {
  return NextResponse.json(
    { status: 'data_unavailable', message },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Pawang-Source': 'backend' } },
  );
}

/** The backend sends null for fields it has no data source for. The UI types expect values, so fill display text. */
const str = (v: string | null | undefined): string => v ?? NA;
const siaga = (v: string | null | undefined): SiagaLevel => (v as SiagaLevel | null) ?? 'Tidak tersedia';

export function normalizeFeature(f: GeoJSONGridFeature): GeoJSONGridFeature {
  const p = f.properties as unknown as Record<string, string | number | null | string[]>;
  return {
    ...f,
    properties: {
      ...f.properties,
      siaga_level: siaga(p.siaga_level as string | null),
      duration_est: str(p.duration_est as string | null),
      peak_time: str(p.peak_time as string | null),
      inundation_range: str(p.inundation_range as string | null),
      recommendation: str(p.recommendation as string | null),
      evacuation_route: str(p.evacuation_route as string | null),
      confidence_score: (p.confidence_score as number | null) ?? 0,
      affected_roads: (p.affected_roads as string[] | null) ?? [],
    },
  };
}

export function normalizeAnalysis(a: AreaAnalysisResponse): AreaAnalysisResponse {
  const r = a as unknown as Record<string, string | number | null | string[]>;
  // Points without a water level cannot be drawn; the chart hides itself when fewer than 2 remain.
  const hydrograph: HydrographPoint[] = (a.hydrograph ?? [])
    .filter((h) => h.waterLevel != null)
    .map((h) => ({ ...h, threshold: h.threshold ?? 0 }));
  return {
    ...a,
    siaga_level: siaga(r.siaga_level as string | null),
    duration_est: str(r.duration_est as string | null),
    peak_time: str(r.peak_time as string | null),
    inundation_range: str(r.inundation_range as string | null),
    recommendation: str(r.recommendation as string | null),
    commuter_advisory: str(r.commuter_advisory as string | null),
    evacuation_route: str(r.evacuation_route as string | null),
    confidence_score: (r.confidence_score as number | null) ?? 0,
    affected_roads: (r.affected_roads as string[] | null) ?? [],
    hydrograph: hydrograph.length >= 2 ? hydrograph : [],
    // Backend stations carry no coordinates or siaga thresholds yet; the map needs lat/lng.
    nearby_stations: (a.nearby_stations ?? []).filter((s) => s.lat != null && s.lng != null),
    safe_shelters: a.safe_shelters ?? [],
  };
}
