import { NextRequest, NextResponse } from 'next/server';
import { BASE_FLOOD_ZONES, adjustFeaturesForTimeHorizon } from '@/data/floodData';
import { TimeHorizon, HeatmapGeoJSONResponse } from '@/data/types';
import { fetchBackend, unavailableResponse, normalizeFeature } from '@/lib/backend';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const time = (searchParams.get('time') as TimeHorizon) || '5h';
  const lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : -6.2088;
  const lon = searchParams.get('lon') ? parseFloat(searchParams.get('lon')!) : 106.8456;

  // Real predictions from the FastAPI backend (flood model). Forwards time, lat, lon and the optional date override.
  const result = await fetchBackend<HeatmapGeoJSONResponse>('/api/v1/heatmap', searchParams);
  if (result.kind === 'unavailable') return unavailableResponse(result.message);
  if (result.kind === 'ok' && Array.isArray(result.data.features) && result.data.features.length > 0) {
    const live = result.data;
    return NextResponse.json(
      { ...live, features: live.features.map(normalizeFeature) },
      { status: 200, headers: { 'Cache-Control': 'no-store', 'X-Pawang-Source': 'backend' } },
    );
  }

  // Fallback: static demo data so the UI still renders when the backend is down or has no data.
  const adjustedFeatures = adjustFeaturesForTimeHorizon(BASE_FLOOD_ZONES, time);
  const highRiskCount = adjustedFeatures.filter(
    (f) => f.properties.risk_level === 'High' || f.properties.risk_level === 'Extreme'
  ).length;

  const response: HeatmapGeoJSONResponse = {
    type: 'FeatureCollection',
    features: adjustedFeatures,
    metadata: {
      generated_at: new Date().toISOString(),
      forecast_horizon: time,
      center: [lat, lon],
      total_grids: adjustedFeatures.length,
      high_risk_count: highRiskCount,
    },
  };

  return NextResponse.json(response, {
    status: 200,
    headers: { 'Cache-Control': 'no-store', 'X-Pawang-Source': 'mock' },
  });
}
