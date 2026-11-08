import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend';
import type { BackendStatus } from '@/data/types';

/** Tells the UI whether the real backend is reachable and, in replay mode, which archive days it can serve. */
export async function GET() {
  const demo = process.env.PAWANG_DEMO_DATE ?? null;
  let body: BackendStatus = { source: 'mock', data_mode: null, replay_dates: null, demo_date: demo };
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const h = await res.json();
      body = {
        source: 'backend',
        data_mode: h.data_mode === 'replay' ? 'replay' : 'live',
        replay_dates: h.replay_dates ?? null,
        demo_date: demo,
      };
    }
  } catch {
    // backend down: keep the mock status
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
