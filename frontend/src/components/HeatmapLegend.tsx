'use client';

import React from 'react';
import { RISK_COLORS } from '@/utils/areaColors';
import type { RiskLevel } from '@/data/types';

// Batas dari model (Low/High) dan pemisahan Medium di backend (MEDIUM_HIGH_FROM).
const TIERS = [
  { risk: 'Low', label: 'Low', range: '< 0,8%' },
  { risk: 'Medium', label: 'Medium', range: '0,8 - 2,15%' },
  { risk: 'Medium-High', label: 'Medium-High', range: '2,15 - 3,3%' },
  { risk: 'High', label: 'High', range: '≥ 3,3%' },
] as const;

export const HeatmapLegend: React.FC<{ dominant?: RiskLevel | null }> = ({ dominant = null }) => (
  <div className="w-64">
    <div className="space-y-2 rounded-2xl border border-[#DADCE0] bg-white/95 p-3 text-[#202124] shadow-md backdrop-blur-md transition-colors dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#E8EAED]">
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
