import { NextRequest, NextResponse } from 'next/server';
import { getAnalysisForGrid } from '@/data/floodData';
import { AreaAnalysisResponse } from '@/data/types';
import { fetchBackend, unavailableResponse, normalizeAnalysis } from '@/lib/backend';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const gridId = searchParams.get('grid_id') || 'JKT-KML-01';

  // Real analysis from the FastAPI backend (model probability + advice).
  const result = await fetchBackend<AreaAnalysisResponse>('/api/v1/analysis', searchParams);
  if (result.kind === 'unavailable') return unavailableResponse(result.message);
  if (result.kind === 'ok' && result.data.grid_id) {
    return NextResponse.json(normalizeAnalysis(result.data), {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'X-Pawang-Source': 'backend' },
    });
  }

  // Fallback: static demo data.
  return NextResponse.json(getAnalysisForGrid(gridId), {
    status: 200,
    headers: { 'Cache-Control': 'no-store', 'X-Pawang-Source': 'mock' },
  });
}
