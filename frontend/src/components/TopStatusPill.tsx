'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, CloudRain, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { PredictionMode } from '@/data/types';

interface TopStatusPillProps {
  embedded?: boolean;
  highRiskCount?: number;
  backendConnected?: boolean | null;
  loading?: boolean;
  unavailable?: boolean;
  mode?: PredictionMode;
}

export const TopStatusPill: React.FC<TopStatusPillProps> = ({
  embedded = false,
  highRiskCount = 0,
  backendConnected = null,
  loading = false,
  unavailable = false,
  mode = 'live',
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
    <div
      className={`top-status-pill flex shrink-0 items-center gap-2.5 text-xs text-[#202124] transition-all dark:text-[#E8EAED] ${
        embedded
          ? 'border-l border-[#DADCE0] pl-3 dark:border-[#3C4043]'
          : 'rounded-full border border-[#DADCE0] bg-white/95 px-3.5 py-1.5 shadow-md backdrop-blur-md dark:border-[#3C4043] dark:bg-[#202124]/95'
      }`}
    >
      {/* Live / Status Indicator Dot */}
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
              ? 'bg-[#BDC1C6] dark:bg-[#5F6368]'
              : backendConnected
                ? 'bg-[#34A853] dark:bg-[#81C995]'
                : 'bg-[#EA4335] dark:bg-[#F28B82]'
          }`}
        />
      </span>

      <span className="h-3.5 w-px bg-[#DADCE0] dark:bg-[#3C4043]" />

      {/* Real-time Clock / Timestamp */}
      <span className="font-mono text-[11px] font-semibold tabular-nums text-[#202124] dark:text-[#E8EAED]">
        {currentTime || '11:00:00 WIB'}
      </span>

      {/* Zone Status */}
      {loading ? (
        <>
          <span className="h-3.5 w-px bg-[#DADCE0] dark:bg-[#3C4043]" />
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5F6368] dark:text-[#9AA0A6]">
            <LoaderCircle size={13} className="shrink-0 animate-spin" />
            <span>Memuat {mode === 'replay' ? 'histori' : 'prediksi'}</span>
          </div>
        </>
      ) : unavailable ? (
        <>
          <span className="h-3.5 w-px bg-[#DADCE0] dark:bg-[#3C4043]" />
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#C5221F] dark:text-[#F28B82]">
            <AlertTriangle size={13} className="shrink-0" />
            <span>Risiko belum tersedia</span>
          </div>
        </>
      ) : highRiskCount > 0 ? (
        <>
          <span className="h-3.5 w-px bg-[#DADCE0] dark:bg-[#3C4043]" />
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#C5221F] dark:text-[#F28B82]">
            <CloudRain size={13} className="shrink-0" />
            <span>{highRiskCount} Zona Risiko Tinggi</span>
          </div>
        </>
      ) : mode === 'replay' ? null : (
        <>
          <span className="h-3.5 w-px bg-[#DADCE0] dark:bg-[#3C4043]" />
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#137333] dark:text-[#81C995]">
            <ShieldCheck size={13} className="shrink-0 text-[#137333] dark:text-[#81C995]" />
            <span>Tidak ada zona risiko tinggi</span>
          </div>
        </>
      )}
    </div>
  );
};
