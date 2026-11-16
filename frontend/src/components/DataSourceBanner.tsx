'use client';

import React from 'react';
import { AlertTriangle, Database, Info } from 'lucide-react';
import type { BackendStatus, DataSource } from '@/data/types';

interface DataSourceBannerProps {
  source: DataSource;
  status: BackendStatus | null;
  /** The day the model predicted (YYYY-MM-DD), as reported by the backend. */
  targetDate: string | null;
  /** The archive day picked by the user, or null. */
  archiveDate: string | null;
  /** Why the backend has no data (when source is 'unavailable'). */
  message: string | null;
  onChangeArchiveDate: (date: string | null) => void;
}

/** Makes clear what the numbers on screen are: model output, an archive replay, or built-in demo data. */
export const DataSourceBanner: React.FC<DataSourceBannerProps> = ({
  source,
  status,
  targetDate,
  archiveDate,
  message,
  onChangeArchiveDate,
}) => {
  if (source === 'loading') return null;

  if (source === 'mock') {
    return (
      <div className="flex max-w-[92vw] items-start gap-2 rounded-xl border border-amber-500/50 bg-[#FFEBCC]/95 dark:bg-[#0D1C42]/95 px-3 py-2 text-[11px] text-[#010736] dark:text-[#FCF1D0] shadow-lg backdrop-blur">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-justify">
          <b>Backend tidak terhubung.</b> Yang tampil adalah data demo bawaan, bukan prediksi model.
        </span>
      </div>
    );
  }

  const isReplay = status?.data_mode === 'replay';
  const range = status?.replay_dates ?? null;
  const datePicker =
    isReplay && range ? (
      <label className="flex items-center gap-1.5">
        <span className="text-[#22396F] dark:text-[#BFDDF0] font-medium">Tanggal</span>
        <input
          type="date"
          min={range.min}
          max={range.max}
          value={archiveDate ?? targetDate ?? ''}
          onChange={(e) => onChangeArchiveDate(e.target.value || null)}
          className="rounded border border-[#22396F] bg-[#FFF9D2] dark:border-[#22396F] dark:bg-[#010736] px-1.5 py-0.5 font-mono text-[11px] text-[#010736] dark:text-[#FCF1D0]"
        />
      </label>
    ) : null;

  if (source === 'unavailable') {
    return (
      <div className="flex max-w-[92vw] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-rose-500/50 bg-[#FFEBCC]/95 dark:bg-[#0D1C42]/95 px-3 py-2 text-[11px] text-rose-800 dark:text-rose-200 shadow-lg backdrop-blur">
        <span className="flex items-center gap-1.5 text-justify">
          <AlertTriangle size={14} className="shrink-0 text-rose-600 dark:text-rose-400" />
          <b>Data belum tersedia.</b> {message}
        </span>
        {datePicker}
      </div>
    );
  }

  return (
    <div className="flex max-w-[92vw] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#22396F] bg-[#FFEBCC]/95 dark:border-[#22396F] dark:bg-[#0D1C42]/95 px-3 py-2 text-[11px] text-[#010736] dark:text-[#FCF1D0] shadow-lg backdrop-blur">
      <span className="flex items-center gap-1.5 font-medium">
        <Database size={13} className="text-[#8CC0EB] dark:text-[#FCF1D0]" />
        {isReplay ? 'Data arsip (replay)' : 'Prediksi model'}
        {targetDate && <b className="font-mono">{targetDate}</b>}
      </span>
      {datePicker}
      {isReplay && (
        <span className="flex items-center gap-1 text-[#22396F] dark:text-[#BFDDF0]">
          <Info size={12} /> Pilihan jam (1h-24h) tidak berpengaruh di mode arsip.
        </span>
      )}
    </div>
  );
};
