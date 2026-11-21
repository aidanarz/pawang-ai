import { MapDashboard } from '@/components/MapDashboard';
import { Suspense } from 'react';

async function MapPageContent({ searchParams }: { searchParams: Promise<{ area?: string | string[] }> }) {
  const { area } = await searchParams;
  return <MapDashboard initialGridId={typeof area === 'string' ? area : undefined} />;
}

export default function MapPage({ searchParams }: { searchParams: Promise<{ area?: string | string[] }> }) {
  return (
    <Suspense fallback={<main className="h-screen w-screen bg-[#010736]" />}>
      <MapPageContent searchParams={searchParams} />
    </Suspense>
  );
}
