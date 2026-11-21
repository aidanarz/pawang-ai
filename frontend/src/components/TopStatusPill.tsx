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
    <div className="top-status-pill flex items-center gap-2.5 rounded-full border border-[#DADCE0] bg-white/95 px-3.5 py-2 text-xs text-[#202124] shadow-md backdrop-blur-md transition-all dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#E8EAED]">
      {/* Live Indicator Dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {backendConnected !== null && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
              backendConnected ? 'bg-[#34A853]' : 'bg-[#EA4335]'
            }`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            backendConnected === null
              ? 'bg-[#9AA0A6]'
              : backendConnected
                ? 'bg-[#34A853]'
                : 'bg-[#EA4335]'
          }`}
        />
      </span>

      <span className="h-3.5 w-px bg-[#DADCE0] dark:bg-[#3C4043]" />

      {/* Real-time Clock / Timestamp */}
      <span className="font-mono text-[11px] font-medium tabular-nums text-[#5F6368] dark:text-[#9AA0A6]">
        {currentTime || '11:00:00 WIB'}
      </span>

      <span className="h-3.5 w-px bg-[#DADCE0] dark:bg-[#3C4043]" />

      {/* Zone Status */}
      {highRiskCount > 0 ? (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#C5221F] dark:text-[#F28B82]">
          <CloudRain size={13} className="shrink-0" />
          <span>{highRiskCount} Zona Risiko Tinggi</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#188038] dark:text-[#81C995]">
          <ShieldCheck size={13} className="shrink-0" />
          <span>Tidak ada zona risiko tinggi</span>
        </div>
      )}
    </div>
  );
};
