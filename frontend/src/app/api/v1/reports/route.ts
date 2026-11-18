import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Live crowd reports. Without the backend there is nowhere to keep them: list nothing, refuse new ones. */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/reports`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (res.ok) return NextResponse.json(await res.json(), { headers: NO_STORE });
  } catch {
    // backend down
  }
  return NextResponse.json({ reports: [] }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ detail: 'Laporan tidak valid.' }, { status: 400 });
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status, headers: NO_STORE });
  } catch {
    return NextResponse.json({ detail: 'Backend tidak tersedia, laporan belum terkirim.' }, { status: 503 });
  }
}
