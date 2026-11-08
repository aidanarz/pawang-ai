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
      <div className="flex max-w-[92vw] items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[11px] text-amber-100 shadow-lg backdrop-blur">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
        <span>
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
        <span className="text-slate-400">Tanggal</span>
        <input
          type="date"
          min={range.min}
          max={range.max}
          value={archiveDate ?? targetDate ?? ''}
          onChange={(e) => onChangeArchiveDate(e.target.value || null)}
          className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-100"
        />
      </label>
    ) : null;

  if (source === 'unavailable') {
    return (
      <div className="flex max-w-[92vw] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-[11px] text-rose-100 shadow-lg backdrop-blur">
        <span className="flex items-center gap-1.5">
          <AlertTriangle size={14} className="shrink-0 text-rose-400" />
          <b>Data belum tersedia.</b> {message}
        </span>
        {datePicker}
      </div>
    );
  }

  return (
    <div className="flex max-w-[92vw] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sky-500/30 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-200 shadow-lg backdrop-blur">
      <span className="flex items-center gap-1.5">
        <Database size={13} className="text-sky-400" />
        {isReplay ? 'Data arsip (replay)' : 'Prediksi model'}
        {targetDate && <b className="font-mono">{targetDate}</b>}
      </span>
      {datePicker}
      {isReplay && (
        <span className="flex items-center gap-1 text-slate-400">
          <Info size={12} /> Pilihan jam (1h-24h) tidak berpengaruh di mode arsip.
        </span>
      )}
    </div>
  );
};
