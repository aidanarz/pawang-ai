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
    <div className="w-64 select-none">
      <div className="space-y-1 rounded-md bg-slate-900/75 px-2 py-1.5 backdrop-blur-sm">
        <div
          className="h-3.5 w-full overflow-hidden rounded-sm"
          style={{
            background:
              'linear-gradient(to right, #22C55E 0%, #84CC16 22%, #EAB308 44%, #FACC15 58%, #F97316 74%, #EF4444 88%, #B91C1C 100%)',
          }}
        />
        <div className="flex justify-between px-0.5 text-[10.5px] font-mono text-slate-100">
          <span>{minProbability === null ? 'Rendah' : `Rendah ${pct(minProbability)}`}</span>
          <span>{maxProbability === null ? 'Tinggi' : `Tinggi ${pct(maxProbability)}`}</span>
        </div>
        <div className="px-0.5 text-[9.5px] leading-tight text-slate-400">
          Probabilitas banjir (model), dibandingkan antar kecamatan pada hari yang sama.
        </div>
      </div>
    </div>
  );
};
