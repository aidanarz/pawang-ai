'use client';

import React from 'react';
import { AlertTriangle, Database } from 'lucide-react';
import type { BackendStatus, DataSource, PredictionMode } from '@/data/types';
import { TopStatusPill } from './TopStatusPill';

interface DataSourceBannerProps {
  source: DataSource;
  status: BackendStatus | null;
  mode: PredictionMode;
  /** The day the model predicted (YYYY-MM-DD), as reported by the backend. */
  targetDate: string | null;
  /** The selected archive day, or null. */
  archiveDate: string | null;
  /** Why the backend has no data (when source is 'unavailable'). */
  message: string | null;
  onChangeMode: (mode: PredictionMode) => void;
  onChangeArchiveDate: (date: string | null) => void;
  highRiskCount: number;
  backendConnected: boolean | null;
  predictionLoading: boolean;
}

/** Combines prediction source controls and connection status in one pill. */
export const DataSourceBanner: React.FC<DataSourceBannerProps> = ({
  source,
  status,
  mode,
  targetDate,
  archiveDate,
  message,
  onChangeMode,
  onChangeArchiveDate,
  highRiskCount,
  backendConnected,
  predictionLoading,
}) => {
  const range = status?.replay_dates ?? null;
  const replayAvailable =
    status?.source === 'backend' &&
    status.available_modes.includes('replay') &&
    range !== null;

  const datePicker =
    mode === 'replay' && range ? (
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Tanggal histori</span>
        <input
          type="date"
          min={range.min}
          max={range.max}
          value={archiveDate ?? ''}
          onChange={(e) => onChangeArchiveDate(e.target.value || null)}
          className="rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-2.5 py-0.5 font-mono text-[11px] text-[#202124] focus:border-[#1A73E8] focus:outline-none dark:border-[#3C4043] dark:bg-[#292A2D] dark:text-[#E8EAED] dark:focus:border-[#8AB4F8]"
        />
      </label>
    ) : null;

  return (
    <div className="flex max-w-[calc(100vw-2rem)] items-center gap-x-3 rounded-full border border-[#DADCE0] bg-white/95 px-3.5 py-2 text-[11px] text-[#202124] shadow-md backdrop-blur-md dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#E8EAED]">
      <span className="flex shrink-0 items-center gap-2 font-medium">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]">
          <Database size={12} />
        </span>
        {mode === 'replay' ? 'Prediksi histori' : 'Prediksi model'}
        {(mode === 'replay' ? archiveDate : targetDate) && (
          <b className="font-mono">{mode === 'replay' ? archiveDate : targetDate}</b>
        )}
      </span>

      <div
        role="group"
        aria-label="Mode prediksi"
        className="inline-flex shrink-0 rounded-full bg-[#F1F3F4] p-0.5 dark:bg-[#292A2D]"
      >
        {(['live', 'replay'] as const).map((option) => {
          const selected = mode === option;
          const disabled = option === 'replay' && !replayAvailable;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChangeMode(option)}
              title={disabled ? 'Arsip histori tidak tersedia' : undefined}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                selected
                  ? 'bg-[#1A73E8] text-white shadow-sm dark:bg-[#8AB4F8] dark:text-[#202124]'
                  : 'text-[#5F6368] hover:text-[#202124] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#9AA0A6] dark:hover:text-[#E8EAED]'
              }`}
            >
              {option === 'live' ? 'Live' : 'Histori'}
            </button>
          );
        })}
      </div>

      {datePicker}

      {source === 'mock' && (
        <span className="flex items-center gap-1.5 text-[#B06000] dark:text-[#FDD663]">
          <AlertTriangle size={13} className="shrink-0" />
          Backend tidak terhubung; data demo ditampilkan.
        </span>
      )}
      {source === 'unavailable' && (
        <span className="flex max-w-[34vw] items-center gap-1.5 text-[#C5221F] dark:text-[#F28B82]">
          <AlertTriangle size={13} className="shrink-0" />
          <b>Data belum tersedia.</b> {message}
        </span>
      )}

      <TopStatusPill
        embedded
        mode={mode}
        highRiskCount={highRiskCount}
        backendConnected={backendConnected}
        loading={predictionLoading}
        unavailable={source === 'unavailable'}
      />
    </div>
  );
};
