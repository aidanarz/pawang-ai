import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Alternative route. It needs the backend (model tiers and the routing engine): without it there is nothing to show. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ detail: 'Permintaan rute tidak valid.' }, { status: 400 });
  // Replay mode needs a target day; PAWANG_DEMO_DATE supplies one when the UI sends none (same as the other routes).
  if (process.env.PAWANG_DEMO_DATE && !body.date) body.date = process.env.PAWANG_DEMO_DATE;
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status, headers: NO_STORE });
  } catch {
    return NextResponse.json({ detail: 'Backend tidak tersedia, rute belum bisa dihitung.' }, { status: 503, headers: NO_STORE });
  }
}
