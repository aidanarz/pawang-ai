'use client';

import React, { useState } from 'react';
import { X, Megaphone, MapPin, Check } from 'lucide-react';
import type { GeoJSONGridFeature } from '@/data/types';
import {
  MAX_REPORT_COMMENT,
  REPORT_CONDITIONS,
  featureCenter,
  type LiveReport,
  type ReportCondition,
} from '@/data/reportConditions';

export interface ReportDraft {
  gridId: string;
  /** [lat, lng] of the report; when absent the middle of the area is used. */
  position?: [number, number];
}

interface ReportModalProps {
  draft: ReportDraft;
  features: GeoJSONGridFeature[];
  onClose: () => void;
  onSent: (report: LiveReport) => void;
  onPickOnMap: (draft: ReportDraft) => void;
}

const field =
  'w-full rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-3 py-2 text-xs text-[#202124] transition placeholder:text-[#5F6368] focus:border-[#1A73E8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30 dark:border-[#3C4043] dark:bg-[#292A2D] dark:text-[#E8EAED] dark:placeholder:text-[#9AA0A6] dark:focus:border-[#8AB4F8] dark:focus:bg-[#292A2D] dark:focus:ring-[#8AB4F8]/30';

/** Mounted fresh for every report (the parent gives it a new draft), so the form always starts from the draft. */
export const ReportModal: React.FC<ReportModalProps> = ({ draft, features, onClose, onSent, onPickOnMap }) => {
  const [gridId, setGridId] = useState(draft.gridId);
  const [position, setPosition] = useState<[number, number] | undefined>(draft.position);
  const [condition, setCondition] = useState<ReportCondition | ''>('');
  const [comment, setComment] = useState('');
  const [busy] = useState(false);
  const [error] = useState<string | null>(null);

  const areas = [...features].sort((a, b) => a.properties.area_name.localeCompare(b.properties.area_name));
  const feature = features.find((f) => f.properties.grid_id === gridId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const at = position ?? (feature ? featureCenter(feature) : null);
    if (!at || !condition) return;
    onSent({
      id: `local-${Date.now()}`,
      lat: at[0],
      lon: at[1],
      condition,
      comment: comment.trim(),
      area_name: feature?.properties.area_name ?? gridId,
      grid_id: gridId,
      created_at: new Date().toISOString(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#DADCE0] bg-white text-[#202124] shadow-2xl dark:border-[#3C4043] dark:bg-[#202124] dark:text-[#E8EAED]"
      >
        {/* ══════════ HEADER ══════════ */}
        <div className="flex items-center justify-between border-b border-[#DADCE0] px-5 py-4 dark:border-[#3C4043]">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]">
              <Megaphone size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold leading-tight tracking-tight">Lapor kondisi saat ini</h2>
              <p className="mt-0.5 text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">
                Bagikan situasi jalan atau genangan di sekitar Anda
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-full border border-[#DADCE0] text-[#5F6368] transition hover:bg-[#F8F9FA] hover:text-[#202124] dark:border-[#5F6368] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D] dark:hover:text-[#E8EAED]"
          >
            <X size={15} />
          </button>
        </div>

        {/* ══════════ BODY ══════════ */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
          {/* Lokasi */}
          <section>
            <label
              htmlFor="report-grid-select"
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F6368] dark:text-[#9AA0A6]"
            >
              Daerah (kecamatan)
            </label>
            <select
              id="report-grid-select"
              className={`${field} dark:[color-scheme:dark]`}
              value={gridId}
              onChange={(e) => {
                setGridId(e.target.value);
                setPosition(undefined);
              }}
            >
              {areas.map((f) => (
                <option
                  key={f.properties.grid_id}
                  value={f.properties.grid_id}
                  className="bg-white text-[#202124] dark:bg-[#292A2D] dark:text-[#E8EAED]"
                >
                  {f.properties.area_name}
                </option>
              ))}
            </select>

            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onPickOnMap({ gridId, position })}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1.5 text-[11px] font-semibold text-[#1A73E8] transition hover:bg-[#E8F0FE] dark:border-[#3C4043] dark:bg-[#292A2D] dark:text-[#8AB4F8] dark:hover:bg-[#1A73E8]/15"
              >
                <MapPin size={12} />
                Pilih titik di peta
              </button>
              {position && (
                <span className="font-mono text-[10px] tabular-nums text-[#5F6368] dark:text-[#9AA0A6]">
                  {position[0].toFixed(4)}, {position[1].toFixed(4)}
                </span>
              )}
            </div>
          </section>

          {/* Kondisi */}
          <section>
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F6368] dark:text-[#9AA0A6]">
              Kondisi saat ini
            </span>
            <div
              role="radiogroup"
              aria-label="Kondisi saat ini"
              className="divide-y divide-[#DADCE0] overflow-hidden rounded-2xl border border-[#DADCE0] dark:divide-[#3C4043] dark:border-[#3C4043]"
            >
              {REPORT_CONDITIONS.map((c) => {
                const selected = condition === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCondition(c.value)}
                    className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs transition ${
                      selected
                        ? 'bg-[#E8F0FE] font-semibold text-[#1A73E8] dark:bg-[#1A73E8]/15 dark:text-[#8AB4F8]'
                        : 'text-[#202124] hover:bg-[#F8F9FA] dark:text-[#E8EAED] dark:hover:bg-[#292A2D]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <span>{c.label}</span>
                    </span>
                    {selected && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Keterangan */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="report-comment"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F6368] dark:text-[#9AA0A6]"
              >
                Keterangan (opsional)
              </label>
              <span className="font-mono text-[10px] tabular-nums text-[#5F6368] dark:text-[#9AA0A6]">
                {comment.length}/{MAX_REPORT_COMMENT}
              </span>
            </div>
            <textarea
              id="report-comment"
              className={`${field} h-20 resize-none rounded-2xl`}
              maxLength={MAX_REPORT_COMMENT}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Contoh: air setinggi lutut di depan pasar, motor tidak bisa lewat"
            />
          </section>

          {error && (
            <div className="rounded-2xl bg-[#FCE8E6] p-3 text-[11px] text-[#C5221F] dark:bg-[#F28B82]/15 dark:text-[#F28B82]">
              {error}
            </div>
          )}
        </div>

        {/* ══════════ FOOTER ══════════ */}
        <div className="space-y-3 border-t border-[#DADCE0] px-5 py-3.5 dark:border-[#3C4043]">
          <p className="text-[10px] leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
            Laporan tampil di peta selama 6 jam dan tidak mengubah prediksi model. Isi laporan belum diverifikasi.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#DADCE0] px-4 py-2 text-xs font-semibold text-[#5F6368] transition hover:bg-[#F8F9FA] hover:text-[#202124] dark:border-[#3C4043] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D] dark:hover:text-[#E8EAED]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy || !condition || !gridId}
              className="flex-1 rounded-full bg-[#1A73E8] py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1765CC] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#8AB4F8] dark:text-[#202124] dark:hover:bg-[#AECBFA]"
            >
              {busy ? 'Mengirim...' : 'Kirim laporan'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
