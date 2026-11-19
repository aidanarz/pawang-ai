'use client';

import React, { useState, useEffect } from 'react';
import { CloudRain, ShieldCheck } from 'lucide-react';

interface TopStatusPillProps {
  highRiskCount?: number;
  backendConnected?: boolean | null;
}

export const TopStatusPill: React.FC<TopStatusPillProps> = ({
  highRiskCount = 0,
  backendConnected = null,
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
          timeZone: 'Asia/Jakarta',
          timeZoneName: 'short',
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="top-status-pill rounded-full px-4 py-2 shadow-md backdrop-blur-md text-xs flex items-center gap-2.5 border border-[#22396F] bg-[#FFEBCC]/95 text-[#010736] dark:border-[#22396F] dark:bg-[#0D1C42]/95 dark:text-[#FCF1D0] transition-all">
      {/* Live Indicator Dot */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {backendConnected !== null && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
              backendConnected ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            backendConnected === null
              ? 'bg-slate-400'
              : backendConnected
                ? 'bg-emerald-500'
                : 'bg-red-500'
          }`}
        />
      </span>

      <span className="text-[#BFDDF0] dark:text-[#22396F]">|</span>

      {/* Real-time Clock / Timestamp */}
      <span className="font-mono text-[11px] font-semibold text-[#010736] dark:text-[#FCF1D0]">
        {currentTime || '11:00:00 WIB'}
      </span>

      <span className="text-[#BFDDF0] dark:text-[#22396F]">|</span>

      {/* Zone Status */}
      {highRiskCount > 0 ? (
        <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-bold text-[11px]">
          <CloudRain size={13} className="shrink-0" />
          <span>{highRiskCount} Zona Risiko Tinggi</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[#010736] dark:text-[#FCF1D0] font-semibold text-[11px]">
          <ShieldCheck size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Tidak ada zona risiko tinggi</span>
        </div>
      )}
    </div>
  );
};
