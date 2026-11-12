/**
 * Flood probability (0..1) as an Indonesian-formatted percentage: comma decimal, one decimal below 10% so that
 * small model probabilities stay readable (0.0572 -> "5,7%"), whole numbers from 10% up (0.42 -> "42%").
 * Returns null when there is no usable number, so the caller can show a dash instead of a made-up 0%.
 */
export function formatProbability(p: number | null | undefined): string | null {
  if (p === null || p === undefined || !Number.isFinite(p)) return null;
  const pct = Math.min(1, Math.max(0, p)) * 100;
  const text = pct < 10 ? pct.toFixed(1) : Math.round(pct).toString();
  return `${text.replace('.', ',')}%`;
}
