'use client';

import React, { useState, useEffect } from 'react';
import { CloudRain, ShieldCheck } from 'lucide-react';

interface TopStatusPillProps {
  highRiskCount?: number;
}

export const TopStatusPill: React.FC<TopStatusPillProps> = ({
  highRiskCount = 0,
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
    <div className="glass-panel rounded-full px-4 py-2 shadow-md backdrop-blur-md text-xs flex items-center gap-2.5 border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 select-none transition-all">
      {/* Live Indicator Dot (SISTEM AKTIF text removed) */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>

      <span className="text-slate-300 dark:text-slate-700 select-none">|</span>

      {/* Real-time Clock / Timestamp */}
      <span className="font-mono text-[11px] font-medium text-[#202124] dark:text-slate-300">
        {currentTime || '11:00:00 WIB'}
      </span>

      <span className="text-slate-300 dark:text-slate-700 select-none">|</span>

      {/* Zone Status */}
      {highRiskCount > 0 ? (
        <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
          <CloudRain size={13} className="shrink-0" />
          <span>{highRiskCount} Zona Siaga/Bahaya</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
          <ShieldCheck size={13} className="shrink-0" />
          <span>Semua Zona Aman</span>
        </div>
      )}
    </div>
  );
};
