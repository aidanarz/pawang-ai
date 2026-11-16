'use client';

import React from 'react';

interface HeatmapLegendProps {
  /** Lowest and highest flood probability (0-1) among the areas on the map. Null while nothing is loaded. */
  minProbability: number | null;
  maxProbability: number | null;
}

const pct = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;

export const HeatmapLegend: React.FC<HeatmapLegendProps> = ({ minProbability, maxProbability }) => {
  return (
    <div className="w-64">
      <div className="space-y-1 rounded-xl border border-[#22396F] bg-[#FFEBCC]/95 px-2.5 py-2 backdrop-blur-md shadow-md dark:border-[#22396F] dark:bg-[#0D1C42]/95 transition-colors">
        <div
          className="h-3.5 w-full overflow-hidden rounded-sm"
          style={{
            background:
              'linear-gradient(to right, #22C55E 0%, #84CC16 22%, #EAB308 44%, #FACC15 58%, #F97316 74%, #EF4444 88%, #B91C1C 100%)',
          }}
        />
        <div className="flex justify-between px-0.5 text-[10.5px] font-mono font-semibold text-[#010736] dark:text-[#FCF1D0]">
          <span>{minProbability === null ? 'Terendah' : `Terendah ${pct(minProbability)}`}</span>
          <span>{maxProbability === null ? 'Tertinggi' : `Tertinggi ${pct(maxProbability)}`}</span>
        </div>
        <div className="px-0.5 text-[9.5px] leading-tight text-[#22396F] dark:text-[#BFDDF0] text-justify">
          Warna = peluang banjir (model) dibanding kecamatan lain pada hari yang sama, bukan luas genangan. Merah belum tentu kategori Tinggi: lihat kategori di panel kanan.
        </div>
      </div>
    </div>
  );
};
