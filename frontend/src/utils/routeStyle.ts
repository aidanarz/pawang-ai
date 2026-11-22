import { RISK_COLORS } from '@/utils/areaColors';
import type { RouteVerdict } from '@/data/types';

/** How each backend verdict is shown: a short label and the colour of the recommended line on the map. */
export const ROUTE_VERDICTS: Record<RouteVerdict, { label: string; color: string }> = {
  clear: { label: 'Rute tercepat aman', color: RISK_COLORS.Low as string },
  safe: { label: 'Rute alternatif menghindari area berisiko', color: RISK_COLORS.Low as string },
  reduced: { label: 'Paparan berkurang, belum nol', color: RISK_COLORS.Medium as string },
  unavoidable: { label: 'Tidak ada rute yang layak menghindari area berisiko', color: RISK_COLORS.High as string },
};

export const FASTEST_ROUTE_COLOR = '#5F6368';

/** "+3.4 km, +12 menit" for a detour, "sama dengan rute tercepat" when it is the same road. */
export function detourText(fastest: { km: number; minutes: number }, rec: { km: number; minutes: number }): string {
  const dk = Math.round((rec.km - fastest.km) * 10) / 10;
  const dm = rec.minutes - fastest.minutes;
  if (dk === 0 && dm === 0) return 'sama dengan rute tercepat';
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return `${sign(dk)} km, ${sign(dm)} menit dibanding rute tercepat`;
}
