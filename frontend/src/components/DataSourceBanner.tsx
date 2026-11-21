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
      <div className="flex max-w-[92vw] items-center gap-2 rounded-full border border-[#DADCE0] bg-white/95 px-3.5 py-2 text-[11px] text-[#3C4043] shadow-md backdrop-blur-md dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#E8EAED]/90">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#FEF7E0] text-[#B06000] dark:bg-[#F9AB00]/15 dark:text-[#FDD663]">
          <AlertTriangle size={12} />
        </span>
        <span className="leading-snug">
          <b className="font-semibold text-[#202124] dark:text-[#E8EAED]">Backend tidak terhubung.</b> Yang tampil adalah
          data demo bawaan, bukan prediksi model.
        </span>
      </div>
    );
  }

  const isReplay = status?.data_mode === 'replay';
  const range = status?.replay_dates ?? null;
  const datePicker =
    isReplay && range ? (
      <label className="flex items-center gap-1.5">
        <span className="font-medium text-[#5F6368] dark:text-[#9AA0A6]">Tanggal</span>
        <input
          type="date"
          min={range.min}
          max={range.max}
          value={archiveDate ?? targetDate ?? ''}
          onChange={(e) => onChangeArchiveDate(e.target.value || null)}
          className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] px-2 py-0.5 font-mono text-[11px] text-[#202124] focus:border-[#1A73E8] focus:outline-none dark:border-[#3C4043] dark:bg-[#292A2D] dark:text-[#E8EAED] dark:focus:border-[#8AB4F8]"
        />
      </label>
    ) : null;

  if (source === 'unavailable') {
    return (
      <div className="flex max-w-[92vw] flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-[#DADCE0] bg-white/95 px-3.5 py-2 text-[11px] text-[#C5221F] shadow-md backdrop-blur-md dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#F28B82]">
        <span className="flex items-center gap-2 leading-snug">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#FCE8E6] text-[#C5221F] dark:bg-[#F28B82]/15 dark:text-[#F28B82]">
            <AlertTriangle size={12} />
          </span>
          <b>Data belum tersedia.</b> {message}
        </span>
        {datePicker}
      </div>
    );
  }

  return (
    <div className="flex max-w-[92vw] flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-[#DADCE0] bg-white/95 px-3.5 py-2 text-[11px] text-[#202124] shadow-md backdrop-blur-md dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#E8EAED]">
      <span className="flex items-center gap-2 font-medium">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]">
          <Database size={12} />
        </span>
        {isReplay ? 'Data arsip (replay)' : 'Prediksi model'}
        {targetDate && <b className="font-mono">{targetDate}</b>}
      </span>
      {datePicker}
      {isReplay && (
        <span className="flex items-center gap-1 text-[#5F6368] dark:text-[#9AA0A6]">
          <Info size={12} /> Pilihan jam (1h-24h) tidak berpengaruh di mode arsip.
        </span>
      )}
    </div>
  );
};
