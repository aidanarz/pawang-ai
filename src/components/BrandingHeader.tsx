'use client';

import React, { useState, useEffect } from 'react';
import { CloudRain, Waves, Sparkles, Search } from 'lucide-react';

interface BrandingHeaderProps {
  onOpenSearch: () => void;
  highRiskCount?: number;
}

export const BrandingHeader: React.FC<BrandingHeaderProps> = ({
  onOpenSearch,
  highRiskCount = 4,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 select-none flex-wrap">
      {/* Main Logo & Platform Badge */}
      <div className="glass-panel rounded-2xl px-3.5 py-2.5 shadow-2xl backdrop-blur-md flex items-center gap-3 border border-slate-200/60 dark:border-slate-800/80">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
            <Waves size={22} className="stroke-[2.5]" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500 items-center justify-center text-[8px] font-bold text-white">
              <Sparkles size={8} />
            </span>
          </span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 dark:from-blue-400 dark:via-sky-300 dark:to-indigo-300 bg-clip-text text-transparent">
              Pawang AI
            </h1>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              v2.4 NOAA-GIS
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5">
            Real-Time Flood Prediction & Water Intelligence
          </p>
        </div>
      </div>

      {/* Live Status and Region Pill (Desktop) */}
      <div className="hidden md:flex items-center gap-2 glass-panel rounded-xl px-3 py-2 shadow-lg backdrop-blur-md text-xs border border-slate-200/60 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[10px]">
            Sistem Aktif
          </span>
        </div>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
          {currentTime || '11:00:00 WIB'}
        </span>

        {highRiskCount > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium text-[11px]">
              <CloudRain size={13} />
              <span>{highRiskCount} Zona Siaga/Bahaya</span>
            </div>
          </>
        )}
      </div>

      {/* Quick Search Shortcut Button */}
      <button
        onClick={onOpenSearch}
        className="glass-panel px-3 py-2 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400/50 transition-all border border-slate-200/60 dark:border-slate-800/80 group"
      >
        <Search size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
        <span className="hidden sm:inline font-medium text-[11px]">Periksa Daerah</span>
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded border border-slate-300/60 dark:border-slate-700">
          ⌘K
        </kbd>
      </button>
    </div>
  );
};
