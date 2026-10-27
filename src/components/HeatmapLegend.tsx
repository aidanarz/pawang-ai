'use client';

import React from 'react';
import { LEGEND_STOPS } from '@/utils/colorScale';

interface HeatmapLegendProps {
  activeRainThreshold?: number | null;
  onSelectThreshold?: (threshold: number | null) => void;
}

export const HeatmapLegend: React.FC<HeatmapLegendProps> = ({
  activeRainThreshold,
  onSelectThreshold,
}) => {
  return (
    <div className="w-64 select-none">
      <div className="space-y-1 rounded-md bg-transparent px-1 py-1">
        <div
          className="h-3.5 w-full overflow-hidden rounded-sm border border-black/10 shadow-inner dark:border-white/10"
          style={{
            background:
              'linear-gradient(to right, #FDE047 0%, #FACC15 16%, #FB923C 33%, #F97316 50%, #C084FC 66%, #9333EA 83%, #C026D3 100%)',
          }}
        />
        <div className="flex justify-between px-0.5">
          {LEGEND_STOPS.map((stop) => {
            const isSelected = activeRainThreshold === stop.mm;
            return (
              <button
                key={stop.mm}
                onClick={() =>
                  onSelectThreshold?.(isSelected ? null : stop.mm)
                }
                className={`text-[10.5px] font-mono transition-colors ${
                  isSelected
                    ? 'font-bold text-blue-600 dark:text-blue-400'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
                aria-label={`Filter rainfall ${stop.label} millimeters`}
              >
                {stop.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
