export type RainKind = 'none' | 'light' | 'moderate' | 'heavy' | 'very_heavy' | 'extreme';

/** BMKG daily rainfall categories (mm/day), the same scale the backend guardrails use. */
const CATEGORIES: Array<{ below: number; kind: RainKind; label: string }> = [
  { below: 0.5, kind: 'none', label: 'Tidak Hujan' },
  { below: 20, kind: 'light', label: 'Hujan Ringan' },
  { below: 50, kind: 'moderate', label: 'Hujan Sedang' },
  { below: 100, kind: 'heavy', label: 'Hujan Lebat' },
  { below: 150, kind: 'very_heavy', label: 'Hujan Sangat Lebat' },
  { below: Infinity, kind: 'extreme', label: 'Hujan Ekstrem' },
];

export function rainCategory(mmPerDay: number): { kind: RainKind; label: string } {
  const c = CATEGORIES.find((x) => mmPerDay < x.below) ?? CATEGORIES[CATEGORIES.length - 1];
  return { kind: c.kind, label: c.label };
}
