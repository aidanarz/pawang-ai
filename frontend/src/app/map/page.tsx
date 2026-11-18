import { MapDashboard } from '@/components/MapDashboard';

export default async function MapPage({ searchParams }: { searchParams: Promise<{ area?: string | string[] }> }) {
  const { area } = await searchParams;
  return <MapDashboard initialGridId={typeof area === 'string' ? area : undefined} />;
}
