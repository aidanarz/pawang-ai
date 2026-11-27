'use client';

import React, { useState } from 'react';
import { BellRing, ChevronDown } from 'lucide-react';
import type { ActiveWarning } from '@/data/agent';
import { WARNING_LEVELS, formatWib, highestLevel, sortWarnings } from '@/utils/warningStyle';

interface WarningBannerProps {
  warnings: ActiveWarning[];
  /** When the agent last checked, if it has. */
  lastCheckedAt: string | null;
  /** Click on a warning: select that kecamatan on the map. */
  onSelect: (gridId: string) => void;
}

/** Early warnings from the Flood Watch Agent: one pill that opens the list. Hidden when there is none. */
export const WarningBanner: React.FC<WarningBannerProps> = ({ warnings, lastCheckedAt, onSelect }) => {
  const [open, setOpen] = useState(false);
  if (warnings.length === 0) return null;
  const top = highestLevel(warnings);
  const color = top ? WARNING_LEVELS[top].color : '#EAB308';

  return (
    <div className="absolute left-4 top-16 z-30 w-[min(20rem,calc(100vw-2rem))]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border bg-white/95 px-3.5 py-2 text-left text-xs font-semibold text-[#202124] shadow-md backdrop-blur-md dark:bg-[#202124]/95 dark:text-[#E8EAED]"
        style={{ borderColor: color }}
      >
        <span className="flex items-center gap-2">
          <BellRing size={14} style={{ color }} aria-hidden />
          {warnings.length} peringatan dini aktif
          {top && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ color, backgroundColor: `${color}22` }}
            >
              {WARNING_LEVELS[top].label}
            </span>
          )}
        </span>
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden />
      </button>

      {open && (
        <div className="mt-1.5 max-h-80 space-y-1.5 overflow-y-auto rounded-2xl border border-[#DADCE0] bg-white/95 p-2 shadow-lg backdrop-blur-md dark:border-[#3C4043] dark:bg-[#202124]/95">
          {sortWarnings(warnings).map((w) => {
            const lvl = WARNING_LEVELS[w.level];
            return (
              <button
                key={w.grid_id}
                type="button"
                onClick={() => {
                  onSelect(w.grid_id);
                  setOpen(false);
                }}
                className="block w-full rounded-xl border-l-4 bg-[#F8F9FA] px-3 py-2 text-left transition hover:brightness-95 dark:bg-[#292A2D]"
                style={{ borderLeftColor: lvl?.color }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#202124] dark:text-[#E8EAED]">{w.area}</span>
                  <span className="text-[10px] font-bold uppercase" style={{ color: lvl?.color }}>
                    {lvl?.label ?? w.level}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-[#3C4043] dark:text-[#E8EAED]/90">{w.message}</p>
                <p className="mt-0.5 text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">Sejak {formatWib(w.since)} WIB</p>
              </button>
            );
          })}
          <p className="px-1 pt-0.5 text-[10px] leading-snug text-[#5F6368] dark:text-[#9AA0A6]">
            Peringatan dari agen pemantau berdasarkan prediksi model, tinggi muka air, dan laporan warga
            {lastCheckedAt ? `. Terakhir dicek ${formatWib(lastCheckedAt)} WIB` : ''}. Ini perkiraan, cek info resmi BPBD.
          </p>
        </div>
      )}
    </div>
  );
};
