'use client';

import React, { useState } from 'react';
import { X, Megaphone } from 'lucide-react';
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
  'w-full rounded-lg border border-[#22396F] bg-[#FFF9D2] px-2 py-1.5 text-xs text-[#010736] dark:bg-[#010736] dark:text-[#FCF1D0]';

/** Mounted fresh for every report (the parent gives it a new draft), so the form always starts from the draft. */
export const ReportModal: React.FC<ReportModalProps> = ({ draft, features, onClose, onSent, onPickOnMap }) => {
  const [gridId, setGridId] = useState(draft.gridId);
  const [position, setPosition] = useState<[number, number] | undefined>(draft.position);
  const [condition, setCondition] = useState<ReportCondition | ''>('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areas = [...features].sort((a, b) => a.properties.area_name.localeCompare(b.properties.area_name));
  const feature = features.find((f) => f.properties.grid_id === gridId);
  const picked = REPORT_CONDITIONS.find((c) => c.value === condition);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const at = position ?? (feature ? featureCenter(feature) : null);
    if (!at || !condition) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: at[0], lon: at[1], condition, comment: comment.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 201 && body?.id) {
        onSent(body as LiveReport);
        return;
      }
      setError(typeof body?.detail === 'string' ? body.detail : 'Laporan tidak bisa dikirim.');
    } catch {
      setError('Laporan tidak bisa dikirim.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-xl border border-[#22396F] bg-[#FFEBCC] p-4 text-[#010736] shadow-2xl dark:bg-[#0D1C42] dark:text-[#FCF1D0]"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-bold">
            <Megaphone size={15} /> Lapor kondisi saat ini
          </span>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded p-1 hover:bg-black/10">
            <X size={15} />
          </button>
        </div>

        <label className="block space-y-1 text-[11px] font-semibold">
          Daerah (kecamatan)
          <select
            className={field}
            value={gridId}
            onChange={(e) => {
              setGridId(e.target.value);
              setPosition(undefined);
            }}
          >
            {areas.map((f) => (
              <option key={f.properties.grid_id} value={f.properties.grid_id}>
                {f.properties.area_name}
              </option>
            ))}
          </select>
        </label>
        {position && (
          <div className="-mt-1 text-[10px] opacity-70">
            Titik di peta: {position[0].toFixed(4)}, {position[1].toFixed(4)}
          </div>
        )}
        <button
          type="button"
          onClick={() => onPickOnMap({ gridId, position })}
          className="w-full rounded-lg border border-dashed border-[#22396F] px-3 py-2 text-[11px] font-bold hover:bg-black/5 dark:hover:bg-white/5"
        >
          Pilih lewat peta
        </button>

        <label className="block space-y-1 text-[11px] font-semibold">
          Kondisi saat ini
          <select
            required
            className={field}
            style={picked ? { borderColor: picked.color, borderWidth: 2 } : undefined}
            value={condition}
            onChange={(e) => setCondition(e.target.value as ReportCondition)}
          >
            <option value="" disabled>
              Pilih kondisi...
            </option>
            {REPORT_CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-[11px] font-semibold">
          Keterangan (opsional)
          <textarea
            className={`${field} h-20 resize-none font-normal`}
            maxLength={MAX_REPORT_COMMENT}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Contoh: air setinggi lutut di depan pasar, motor tidak bisa lewat"
          />
          <span className="block text-right text-[10px] font-normal opacity-70">
            {comment.length}/{MAX_REPORT_COMMENT}
          </span>
        </label>

        <p className="text-[10px] leading-snug opacity-80">
          Laporan tampil di peta selama 6 jam dan tidak mengubah prediksi model. Isi laporan belum diverifikasi.
        </p>
        {error && <div className="rounded-md bg-red-500/15 p-2 text-[11px] text-red-700 dark:text-red-300">{error}</div>}

        <button
          type="submit"
          disabled={busy || !condition || !gridId}
          className="w-full rounded-lg border border-[#22396F] bg-[#8CC0EB] py-2 text-xs font-bold text-[#010736] disabled:opacity-50 dark:bg-[#22396F] dark:text-[#FCF1D0]"
        >
          {busy ? 'Mengirim...' : 'Kirim laporan'}
        </button>
      </form>
    </div>
  );
};
