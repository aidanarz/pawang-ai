'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RISK_COLORS } from '@/utils/areaColors';
import type { RiskLevel } from '@/data/types';

// Batas dari model (Low/High) dan pemisahan Medium di backend (MEDIUM_HIGH_FROM).
const TIERS = [
  { risk: 'Low', label: 'Low', range: '< 0,8%' },
  { risk: 'Medium', label: 'Medium', range: '0,8 - 2,15%' },
  { risk: 'Medium-High', label: 'Medium-High', range: '2,15 - 3,3%' },
  { risk: 'High', label: 'High', range: '≥ 3,3%' },
] as const;

export const HeatmapLegend: React.FC<{ dominant?: RiskLevel | null }> = ({ dominant = null }) => {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Tampilkan legenda risiko"
        title="Tampilkan legenda risiko"
        className="flex items-center gap-2 rounded-full border border-[#DADCE0] bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-[#202124] shadow-md backdrop-blur-md transition hover:bg-[#F8F9FA] dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#E8EAED] dark:hover:bg-[#292A2D]"
      >
        <span className="flex gap-1">
          {TIERS.map((t) => (
            <span key={t.risk} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RISK_COLORS[t.risk] }} />
          ))}
        </span>
        Legenda
        <ChevronUp size={13} aria-hidden />
      </button>
    );
  }

  return (
    <div className="w-64">
      <div className="space-y-2 rounded-2xl border border-[#DADCE0] bg-white/95 p-3 text-[#202124] shadow-md backdrop-blur-md transition-colors dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#E8EAED]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold">Legenda risiko</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Kecilkan legenda risiko"
            title="Kecilkan"
            className="grid h-6 w-6 place-items-center rounded-full text-[#5F6368] transition hover:bg-[#F1F3F4] dark:text-[#9AA0A6] dark:hover:bg-[#3C4043]/60"
          >
            <ChevronDown size={14} />
          </button>
        </div>
        <ul className="space-y-1.5 text-[11px] font-medium">
          {TIERS.map((t) => (
            <li key={t.risk} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: RISK_COLORS[t.risk] }} />
              <span className="flex-1 font-semibold">{t.label}</span>
              <span className="font-mono text-[10px] tabular-nums text-[#5F6368] dark:text-[#9AA0A6]">{t.range}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-[#DADCE0] pt-2 text-[10px] leading-relaxed text-[#5F6368] dark:border-[#3C4043] dark:text-[#9AA0A6]">
          Warna menunjukkan peluang banjir (model), bukan luas genangan.
        </div>
        {dominant && (
          <div className="text-[10px] leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
            Mayoritas {dominant}: makin gelap berarti peluang relatif lebih tinggi.
          </div>
        )}
      </div>
    </div>
  );
};
