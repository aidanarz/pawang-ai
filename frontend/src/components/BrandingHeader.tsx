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
    <div className="flex items-center gap-3 flex-wrap">
      {/* Main Logo & Platform Badge */}
      <div className="rounded-2xl px-3.5 py-2.5 shadow-2xl backdrop-blur-md flex items-center gap-3 border border-[#22396F] bg-[#FFEBCC]/95 dark:border-[#22396F] dark:bg-[#0D1C42]/95 transition-colors">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8CC0EB] via-[#22396F] to-[#010736] flex items-center justify-center text-white shadow-lg">
            <Waves size={22} className="stroke-[2.5]" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8CC0EB] opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#8CC0EB] items-center justify-center text-[8px] font-bold text-white">
              <Sparkles size={8} />
            </span>
          </span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-extrabold tracking-tight text-[#010736] dark:text-[#FCF1D0]">
              Pawang AI
            </h1>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-[#BFDDF0] text-[#010736] dark:bg-[#22396F] dark:text-[#FCF1D0] border border-[#22396F]/50 dark:border-[#22396F]">
              v2.4 NOAA-GIS
            </span>
          </div>
          <p className="text-[11px] text-[#22396F] dark:text-[#BFDDF0] font-medium leading-none mt-0.5">
            Real-Time Flood Prediction & Water Intelligence
          </p>
        </div>
      </div>

      {/* Live Status and Region Pill (Desktop) */}
      <div className="hidden md:flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg backdrop-blur-md text-xs border border-[#22396F] bg-[#FFEBCC]/95 text-[#010736] dark:border-[#22396F] dark:bg-[#0D1C42]/95 dark:text-[#FCF1D0] transition-colors">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="font-semibold uppercase tracking-wider text-[10px]">
            Sistem Aktif
          </span>
        </div>

        <span className="text-[#BFDDF0] dark:text-[#22396F]">|</span>

        <span className="font-mono text-[11px] font-medium">
          {currentTime || '11:00:00 WIB'}
        </span>

        {highRiskCount > 0 && (
          <>
            <span className="text-[#BFDDF0] dark:text-[#22396F]">|</span>
            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium text-[11px]">
              <CloudRain size={13} />
              <span>{highRiskCount} Zona Risiko Tinggi</span>
            </div>
          </>
        )}
      </div>

      {/* Quick Search Shortcut Button */}
      <button
        onClick={onOpenSearch}
        className="px-3 py-2 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-2 text-xs border border-[#22396F] bg-[#FFEBCC]/95 text-[#010736] hover:bg-[#FFF9D2] dark:border-[#22396F] dark:bg-[#0D1C42]/95 dark:text-[#FCF1D0] dark:hover:bg-[#22396F] transition-all group"
      >
        <Search size={14} className="text-[#8CC0EB] dark:text-[#FCF1D0] group-hover:scale-110 transition-transform" />
        <span className="hidden sm:inline font-medium text-[11px]">Periksa Daerah</span>
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-[#FFF9D2] dark:bg-[#010736] text-[#010736] dark:text-[#FCF1D0] rounded border border-[#22396F] dark:border-[#22396F]">
          Ctrl+K
        </kbd>
      </button>
    </div>
  );
};
