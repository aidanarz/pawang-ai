'use client';

import React from 'react';
import { Compass, MapPin, Route as RouteIcon, X } from 'lucide-react';
import type { GeoJSONGridFeature, RouteResponse } from '@/data/types';
import { FASTEST_ROUTE_COLOR, ROUTE_VERDICTS, detourText } from '@/utils/routeStyle';

export interface RoutePlannerProps {
  /** The selected area: where the route starts (or the spot last clicked on the map). */
  originName: string | null;
  features: GeoJSONGridFeature[];
  destination: { label: string; gridId?: string } | null;
  route: RouteResponse | null;
  loading: boolean;
  error: string | null;
  picking: boolean;
  onChooseArea: (gridId: string) => void;
  onPickOnMap: () => void;
  onRun: () => void;
  onClear: () => void;
}

const field =
  'w-full rounded-xl border border-[#DADCE0] bg-white px-3 py-2 text-[13px] text-[#202124] dark:border-[#3C4043] dark:bg-[#202124] dark:text-[#E8EAED]';

export const RoutePlanner: React.FC<RoutePlannerProps> = ({
  originName,
  features,
  destination,
  route,
  loading,
  error,
  picking,
  onChooseArea,
  onPickOnMap,
  onRun,
  onClear,
}) => {
  const areas = [...features].sort((a, b) => a.properties.area_name.localeCompare(b.properties.area_name));
  const verdict = route ? ROUTE_VERDICTS[route.verdict] : null;

  return (
    <div className="space-y-3 rounded-2xl bg-[#F8F9FA] p-3.5 dark:bg-[#292A2D]">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#202124] dark:text-[#E8EAED]">
        <Compass size={16} className="shrink-0 text-[#1A73E8] dark:text-[#8AB4F8]" />
        Cari rute yang menghindari banjir
      </div>

      <div className="space-y-1">
        <div className="text-[11px] font-medium text-[#5F6368] dark:text-[#9AA0A6]">Dari</div>
        <div className="flex items-center gap-2 rounded-xl border border-[#DADCE0] px-3 py-2 text-[13px] text-[#202124] dark:border-[#3C4043] dark:text-[#E8EAED]">
          <MapPin size={14} className="shrink-0 text-[#34A853]" />
          {originName ?? 'Pilih daerah di peta atau kotak pencarian'}
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="route-destination" className="text-[11px] font-medium text-[#5F6368] dark:text-[#9AA0A6]">
          Ke
        </label>
        <select
          id="route-destination"
          className={field}
          value={destination?.gridId ?? ''}
          onChange={(e) => e.target.value && onChooseArea(e.target.value)}
        >
          <option value="">{destination && !destination.gridId ? destination.label : 'Pilih kecamatan tujuan...'}</option>
          {areas.map((f) => (
            <option key={f.properties.grid_id} value={f.properties.grid_id}>
              {f.properties.area_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onPickOnMap}
          disabled={picking}
          className="text-[12px] font-semibold text-[#1A73E8] hover:underline disabled:opacity-60 dark:text-[#8AB4F8]"
        >
          {picking ? 'Klik titik tujuan di peta...' : 'atau pilih tujuan langsung di peta'}
        </button>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={loading || !originName || !destination}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1A73E8] px-3 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
      >
        <RouteIcon size={15} aria-hidden />
        {loading ? 'Menghitung rute...' : 'Cari rute'}
      </button>

      {error && (
        <div className="rounded-xl bg-red-500/10 p-2.5 text-[12px] text-red-700 dark:text-red-300">{error}</div>
      )}

      {route && verdict && (
        <div className="space-y-2 border-t border-[#DADCE0] pt-3 dark:border-[#3C4043]">
          <div className="flex items-center justify-between gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ color: verdict.color, backgroundColor: `${verdict.color}22` }}
            >
              {verdict.label}
            </span>
            <button
              type="button"
              onClick={onClear}
              aria-label="Hapus rute"
              className="rounded p-1 text-[#5F6368] hover:bg-black/10 dark:text-[#9AA0A6]"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-[13px] leading-relaxed text-[#3C4043] dark:text-[#E8EAED]/90">{route.message}</p>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-xl border border-[#DADCE0] p-2 dark:border-[#3C4043]">
              <div className="flex items-center gap-1.5 font-semibold" style={{ color: verdict.color }}>
                <span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: verdict.color }} />
                Disarankan
              </div>
              <div className="mt-1 tabular-nums text-[#202124] dark:text-[#E8EAED]">
                {route.recommended.km} km, {route.recommended.minutes} menit
              </div>
              <div className="text-[#5F6368] dark:text-[#9AA0A6]">{route.recommended.high_km} km area berisiko tinggi</div>
            </div>
            <div className="rounded-xl border border-[#DADCE0] p-2 dark:border-[#3C4043]">
              <div className="flex items-center gap-1.5 font-semibold text-[#5F6368] dark:text-[#9AA0A6]">
                <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: FASTEST_ROUTE_COLOR }} />
                Tercepat
              </div>
              <div className="mt-1 tabular-nums text-[#202124] dark:text-[#E8EAED]">
                {route.fastest.km} km, {route.fastest.minutes} menit
              </div>
              <div className="text-[#5F6368] dark:text-[#9AA0A6]">{route.fastest.high_km} km area berisiko tinggi</div>
            </div>
          </div>
          <div className="text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">
            {detourText(route.fastest, route.recommended)}
            {route.flood_points_known > 0 && ` · ${route.flood_points_known} titik banjir laporan warga dihitung`}
          </div>
        </div>
      )}

      <p className="text-[10.5px] leading-snug text-[#5F6368] dark:text-[#9AA0A6]">
        Panduan, bukan jaminan jalan bebas banjir. Area berisiko berasal dari prediksi model untuk hari prakiraan
        (kategori High) dan laporan warga; jalan dari OpenStreetMap (profil sepeda motor). Cek kondisi di lapangan.
      </p>
    </div>
  );
};
