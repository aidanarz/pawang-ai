import { NextResponse } from 'next/server';
import { BASE_FLOOD_ZONES } from '@/data/floodData';
import { BACKEND_URL } from '@/lib/backend';

/** Kecamatan names and ids for the landing search. Backend list when it is up, the demo areas otherwise. */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/areas`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (res.ok) return NextResponse.json(await res.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // backend down: use the demo areas the map would show
  }
  const areas = BASE_FLOOD_ZONES.map((f) => ({ grid_id: f.properties.grid_id, name: f.properties.area_name }));
  return NextResponse.json({ areas }, { headers: { 'Cache-Control': 'no-store' } });
}
