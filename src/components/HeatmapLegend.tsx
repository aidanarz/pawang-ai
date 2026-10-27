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
          className="h-3.5 w-full overflow-hidden rounded-sm"
          style={{
            background:
              'linear-gradient(to right, #22C55E 0%, #84CC16 22%, #EAB308 44%, #FACC15 58%, #F97316 74%, #EF4444 88%, #B91C1C 100%)',
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
                    : 'text-black dark:text-slate-100'
                }`}
                aria-label={`Filter rainfall ${stop.label} millimeters`}
              >
                {stop.mm === 1.5 ? `${stop.label} mm` : stop.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
