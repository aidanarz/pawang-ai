import { RISK_COLORS } from '@/utils/areaColors';
import type { ActiveWarning, WarningLevel } from '@/data/agent';

/** Warning levels use the risk-tier colours: yellow, orange, red. */
export const WARNING_LEVELS: Record<WarningLevel, { label: string; color: string; rank: number }> = {
  waspada: { label: 'Waspada', color: RISK_COLORS.Medium as string, rank: 1 },
  siaga: { label: 'Siaga', color: RISK_COLORS['Medium-High'] as string, rank: 2 },
  awas: { label: 'Awas', color: RISK_COLORS.High as string, rank: 3 },
};

/** Highest level first, then the newest. */
export function sortWarnings(list: ActiveWarning[]): ActiveWarning[] {
  return [...list].sort(
    (a, b) =>
      (WARNING_LEVELS[b.level]?.rank ?? 0) - (WARNING_LEVELS[a.level]?.rank ?? 0) ||
      Date.parse(b.since) - Date.parse(a.since)
  );
}

export function highestLevel(list: Array<{ level: WarningLevel }>): WarningLevel | null {
  let best: WarningLevel | null = null;
  for (const w of list) {
    if (WARNING_LEVELS[w.level] && (!best || WARNING_LEVELS[w.level].rank > WARNING_LEVELS[best].rank)) best = w.level;
  }
  return best;
}

const KIND_LABELS: Record<string, string> = {
  tier_up: 'Tier risiko naik',
  first_seen_high: 'Pertama terdeteksi di tier tinggi',
  siaga_up: 'Status Siaga BPBD naik',
  citizen_reports: 'Laporan warga menumpuk',
};

export const changeKindLabel = (kind: string): string => KIND_LABELS[kind] ?? kind;

/** "27 Nov 2026 06.00" in Jakarta time. */
export function formatWib(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
