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
    <div className="top-status-pill glass-panel rounded-full px-4 py-2 shadow-md backdrop-blur-md text-xs flex items-center gap-2.5 border-none bg-white text-black dark:bg-slate-900/90 dark:text-slate-100 select-none transition-all">
      {/* Live Indicator Dot (SISTEM AKTIF text removed) */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-30 dark:bg-slate-400" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-black dark:bg-slate-300" />
      </span>

      <span className="text-black dark:text-slate-500 select-none">|</span>

      {/* Real-time Clock / Timestamp */}
      <span className="font-mono text-[11px] font-medium text-black dark:text-slate-300">
        {currentTime || '11:00:00 WIB'}
      </span>

      <span className="text-black dark:text-slate-500 select-none">|</span>

      {/* Zone Status */}
      {highRiskCount > 0 ? (
        <div className="flex items-center gap-1.5 text-black dark:text-slate-200 font-semibold text-[11px]">
          <CloudRain size={13} className="shrink-0" />
          <span>{highRiskCount} Zona Siaga/Bahaya</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-black dark:text-slate-200 font-semibold text-[11px]">
          <ShieldCheck size={13} className="shrink-0" />
          <span>Semua Zona Aman</span>
        </div>
      )}
    </div>
  );
};
