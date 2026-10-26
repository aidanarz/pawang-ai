'use client';

import React, { useState } from 'react';
import { LEGEND_STOPS } from '@/utils/colorScale';
import { ChevronDown, ChevronUp, Layers, Info } from 'lucide-react';

interface HeatmapLegendProps {
  activeRainThreshold?: number | null;
  onSelectThreshold?: (threshold: number | null) => void;
}

export const HeatmapLegend: React.FC<HeatmapLegendProps> = ({
  activeRainThreshold,
  onSelectThreshold,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  return (
    <div className="select-none transition-all duration-300">
      <div className="glass-panel rounded-xl shadow-xl overflow-hidden backdrop-blur-md">
        {/* Legend Header */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/5 dark:bg-slate-900/40 border-b border-slate-200/50 dark:border-slate-800/60">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Layers size={13} />
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">
                Intensitas Banjir & Hujan
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                (mm/jam)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded"
              title={isCollapsed ? 'Perluas Legend' : 'Kecilkan Legend'}
            >
              {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="p-3 space-y-2">
            {/* Color Gradient Bar */}
            <div className="relative pt-1">
              <div
                className="h-3.5 w-full rounded-md shadow-inner flex overflow-hidden border border-black/10 dark:border-white/10"
                style={{
                  background:
                    'linear-gradient(to right, #FDE047 0%, #FACC15 16%, #FB923C 33%, #F97316 50%, #C084FC 66%, #9333EA 83%, #C026D3 100%)',
                }}
              />

              {/* Tick Marks and Labels */}
              <div className="flex justify-between items-start mt-1.5 px-0.5">
                {LEGEND_STOPS.map((stop) => {
                  const isSelected = activeRainThreshold === stop.mm;
                  return (
                    <button
                      key={stop.mm}
                      onClick={() =>
                        onSelectThreshold &&
                        onSelectThreshold(isSelected ? null : stop.mm)
                      }
                      onMouseEnter={() => setShowTooltip(stop.desc)}
                      onMouseLeave={() => setShowTooltip(null)}
                      className={`group flex flex-col items-center transition-all ${
                        isSelected
                          ? 'scale-110 font-bold text-blue-600 dark:text-blue-400'
                          : 'hover:scale-105'
                      }`}
                    >
                      <span className="w-0.5 h-1.5 bg-slate-400 dark:bg-slate-500 group-hover:bg-blue-500 rounded-full mb-0.5" />
                      <span className="text-[10.5px] font-mono font-medium text-slate-600 dark:text-slate-300">
                        {stop.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Risk Category Badges Bar */}
            <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
              <div className="px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-[9.5px] font-semibold text-yellow-700 dark:text-yellow-300">
                Aman / Rendah
              </div>
              <div className="px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-[9.5px] font-semibold text-orange-700 dark:text-orange-300">
                Waspada
              </div>
              <div className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[9.5px] font-semibold text-purple-700 dark:text-purple-300">
                Siaga
              </div>
              <div className="px-1.5 py-0.5 rounded bg-fuchsia-600/15 border border-fuchsia-500/30 text-[9.5px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                Bahaya / Ekstrem
              </div>
            </div>

            {/* Dynamic Tooltip Info */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
              <Info size={11} className="text-blue-500 shrink-0" />
              <span className="truncate">
                {showTooltip || 'Model Pawang AI: NOAA Hydrology & Radar Satelit BMKG'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
