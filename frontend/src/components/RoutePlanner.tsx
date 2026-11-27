'use client';

import React from 'react';
import { Compass, MapPin, Route as RouteIcon, X } from 'lucide-react';
import type { GeoJSONGridFeature, RouteResponse } from '@/data/types';
import { FASTEST_ROUTE_COLOR, ROUTE_VERDICTS, detourText, riskAvoided } from '@/utils/routeStyle';
import { AreaPickerInput } from './AreaPickerInput';

export interface RoutePlannerProps {
  /** Where the route starts: the area picked in the "Dari" box, else the selected area on the map. */
  originName: string | null;
  /** True when the user picked the start in the "Dari" box (not just the selected area). */
  originIsPicked: boolean;
  onChooseOrigin: (gridId: string) => void;
  onResetOrigin: () => void;
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
  originIsPicked,
  onChooseOrigin,
  onResetOrigin,
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
  const avoided = route ? riskAvoided(route.fastest, route.recommended) : { highKm: 0, floodPoints: 0 };

  return (
    <div className="space-y-3 rounded-2xl bg-[#F8F9FA] p-3.5 dark:bg-[#292A2D]">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#202124] dark:text-[#E8EAED]">
        <Compass size={16} className="shrink-0 text-[#1A73E8] dark:text-[#8AB4F8]" />
        Cari rute yang menghindari banjir
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="route-origin" className="text-[11px] font-medium text-[#5F6368] dark:text-[#9AA0A6]">
            Dari
          </label>
          {originIsPicked && (
            <button
              type="button"
              onClick={onResetOrigin}
              className="text-[11px] font-semibold text-[#1A73E8] hover:underline dark:text-[#8AB4F8]"
            >
              Pakai daerah terpilih di peta
            </button>
          )}
        </div>
        <AreaPickerInput
          id="route-origin"
          features={features}
          valueLabel={originName}
          placeholder="Cari daerah asal..."
          icon={<MapPin size={14} className="text-[#34A853]" />}
          onChoose={onChooseOrigin}
        />
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
          {route.explanation_by === 'qwen' && (
            <p className="text-[10.5px] text-[#5F6368] dark:text-[#9AA0A6]">
              Penjelasan ditulis AI; angka, nama jalan, dan klaimnya dicek aturan terhadap hasil rute.
            </p>
          )}
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
          <ul className="space-y-0.5 text-[12px] text-[#3C4043] dark:text-[#E8EAED]/90">
            {avoided.highKm > 0 && (
              <li>
                Area berisiko tinggi dihindari: <b>{avoided.highKm.toFixed(1)} km</b> ({route.fastest.high_km.toFixed(1)} →{' '}
                {route.recommended.high_km.toFixed(1)} km)
              </li>
            )}
            {avoided.floodPoints > 0 && (
              <li>
                Titik banjir laporan warga dihindari: <b>{avoided.floodPoints}</b>
              </li>
            )}
            <li>Dibanding rute tercepat: {detourText(route.fastest, route.recommended)}</li>
          </ul>
          {route.flood_points_known > 0 && (
            <div className="text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">
              {route.flood_points_known} titik banjir laporan warga ikut dihitung
            </div>
          )}
        </div>
      )}

      <p className="text-[10.5px] leading-snug text-[#5F6368] dark:text-[#9AA0A6]">
        Panduan, bukan jaminan jalan bebas banjir. Area berisiko berasal dari prediksi model untuk hari prakiraan
        (kategori High) dan laporan warga; jalan dari OpenStreetMap (profil sepeda motor). Cek kondisi di lapangan.
      </p>
    </div>
  );
};
