import type { PredictionMode } from '@/data/types';

export function predictionModeParams(mode: PredictionMode, archiveDate: string | null): Record<string, string> {
  return {
    mode,
    ...(mode === 'replay' && archiveDate ? { date: archiveDate } : {}),
  };
}
