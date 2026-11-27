import type { Metadata } from 'next';
import { AgentLog } from '@/components/AgentLog';

export const metadata: Metadata = {
  title: 'Log Flood Watch Agent',
  robots: { index: false, follow: false },
};

export default function AgentLogPage() {
  return <AgentLog />;
}
