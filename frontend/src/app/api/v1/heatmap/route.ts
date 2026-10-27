import { NextRequest, NextResponse } from 'next/server';
import { BASE_FLOOD_ZONES, adjustFeaturesForTimeHorizon } from '@/data/floodData';
import { TimeHorizon, HeatmapGeoJSONResponse } from '@/data/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const time = (searchParams.get('time') as TimeHorizon) || '5h';
  const lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : -6.2088;
  const lon = searchParams.get('lon') ? parseFloat(searchParams.get('lon')!) : 106.8456;

  // Filter or dynamically adjust features according to time horizon
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
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  });
}
