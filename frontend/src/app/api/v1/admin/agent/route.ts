import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Admin side of the Flood Watch Agent. The browser sends the admin token in the x-admin-token header and this route
 * passes it on; the backend does the checking (404 when no token is configured, 401 when it is wrong).
 */
const unreachable = () =>
  NextResponse.json({ detail: 'Backend tidak tersedia.' }, { status: 503, headers: NO_STORE });

/** The agent log: every cycle with its changes, tool calls, proposal and guardrail result. */
export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/admin/agent-log?limit=100`, {
      headers: { 'X-Admin-Token': request.headers.get('x-admin-token') ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status, headers: NO_STORE });
  } catch {
    return unreachable();
  }
}

/** Run one cycle now ({ date?: 'YYYY-MM-DD' }; replay mode needs a date). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const params = new URLSearchParams();
  const date = typeof body?.date === 'string' && body.date ? body.date : process.env.PAWANG_DEMO_DATE;
  if (date) params.set('date', date);
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/watch/run?${params.toString()}`, {
      method: 'POST',
      headers: { 'X-Admin-Token': request.headers.get('x-admin-token') ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(120000),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status, headers: NO_STORE });
  } catch {
    return unreachable();
  }
}
