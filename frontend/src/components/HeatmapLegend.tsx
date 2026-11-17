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
    <div className="space-y-1.5 rounded-xl border border-[#22396F] bg-[#FFEBCC]/95 px-2.5 py-2 backdrop-blur-md shadow-md dark:border-[#22396F] dark:bg-[#0D1C42]/95 transition-colors">
      <ul className="space-y-1 text-[10.5px] font-semibold text-[#010736] dark:text-[#FCF1D0]">
        {TIERS.map((t) => (
          <li key={t.risk} className="flex items-center gap-2">
            <span className="h-3 w-5 shrink-0 rounded-sm" style={{ backgroundColor: RISK_COLORS[t.risk] }} />
            <span className="flex-1">{t.label}</span>
            <span className="font-mono">{t.range}</span>
          </li>
        ))}
      </ul>
      <div className="px-0.5 text-[9.5px] leading-tight text-[#22396F] dark:text-[#BFDDF0] text-justify">
        Warna = kategori peluang banjir (model) untuk hari prakiraan, bukan luas genangan.
      </div>
      {dominant && (
        <div className="px-0.5 text-[9.5px] leading-tight text-[#22396F] dark:text-[#BFDDF0] text-justify">
          Hampir semua area berkategori {dominant}. Warna tetap {dominant}; gelap = peluang relatif lebih tinggi
          di antara area tersebut, terang = relatif lebih rendah. Bukan kategori yang lebih rendah.
        </div>
      )}
    </div>
  </div>
);
