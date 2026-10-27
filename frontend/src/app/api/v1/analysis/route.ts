import { NextRequest, NextResponse } from 'next/server';
import { getAnalysisForGrid } from '@/data/floodData';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const gridId = searchParams.get('grid_id') || 'JKT-KML-01';

  const analysis = getAnalysisForGrid(gridId);

  return NextResponse.json(analysis, {
    status: 200,
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  });
}
