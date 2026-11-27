import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Early warnings from the Flood Watch Agent. Without the backend there are none to show. */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/warnings`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (res.ok) return NextResponse.json(await res.json(), { headers: NO_STORE });
  } catch {
    // backend down
  }
  return NextResponse.json({ active: [], warnings: [], last_cycle: null }, { headers: NO_STORE });
}
