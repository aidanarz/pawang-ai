'use client';

import React from 'react';
import { Cloud, CloudDrizzle, Droplets, CloudLightning, CloudRain, CloudRainWind, Sun } from 'lucide-react';
import { RainKind, rainCategory } from '@/utils/rainCategory';

const ICONS: Record<RainKind, { Icon: typeof Sun; color: string }> = {
  none: { Icon: Sun, color: 'text-amber-500' },
  light: { Icon: CloudDrizzle, color: 'text-sky-400' },
  moderate: { Icon: CloudRain, color: 'text-sky-500' },
  heavy: { Icon: CloudRainWind, color: 'text-blue-600' },
  very_heavy: { Icon: CloudLightning, color: 'text-indigo-600' },
  extreme: { Icon: CloudLightning, color: 'text-rose-600' },
};

interface RainForecastProps {
  /** Rainfall of the predicted day, mm/day. */
  rainfallMm: number;
  /** Chance of rain (%) from Open-Meteo, shown top right. Hidden when the API gave none. */
  probabilityPct?: number | null;
  /** Predicted day (YYYY-MM-DD), when the backend sent it. */
  targetDate?: string;
  /** Daily rainfall for the days up to and including the predicted day. */
  daily: Array<{ time: string; rainfall: number }>;
}

const SCALE_MM = 20; // bars are scaled to at least 20 mm so a drizzle does not look like a storm

export const RainForecast: React.FC<RainForecastProps> = ({ rainfallMm, probabilityPct, targetDate, daily }) => {
  const { kind, label } = rainCategory(rainfallMm);
  const { Icon, color } = ICONS[kind];
  const isDate = (t: string) => /^\d{4}-\d{2}-\d{2}$/.test(t);
  const days = daily.filter((d) => isDate(d.time));
  const top = Math.max(SCALE_MM, ...days.map((d) => d.rainfall));

  return (
    <div className="space-y-3 px-3 pb-3">
      <div className="flex items-start gap-3">
        <Icon size={40} className={color} aria-hidden />
        <div>
          <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{label}</div>
          <div className="text-slate-500 dark:text-slate-400">
            <b className="tabular-nums">{rainfallMm}</b> mm/hari{targetDate ? ` pada ${targetDate}` : ''}
          </div>
        </div>
        {probabilityPct != null && (
          <div
            className="ml-auto flex flex-col items-end leading-none"
            title="Peluang hujan pada hari prakiraan, dari Open-Meteo"
          >
            <span className="flex items-center gap-1 text-sm font-extrabold tabular-nums text-sky-500">
              <Droplets size={12} aria-hidden />
              {probabilityPct}%
            </span>
            <span className="mt-0.5 text-[9px] text-slate-400">peluang hujan</span>
          </div>
        )}
      </div>

      {days.length > 1 && (
        <div>
          <div className="flex h-16 items-end gap-1" role="img" aria-label="Curah hujan harian, mm">
            {days.map((d) => {
              const isTarget = d.time === targetDate;
              return (
                <div key={d.time} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                  <span className="text-[9px] tabular-nums text-slate-500 dark:text-slate-400">
                    {Math.round(d.rainfall)}
                  </span>
                  <div
                    className={`w-full rounded-t-sm ${isTarget ? 'bg-blue-600' : 'bg-slate-400/60'}`}
                    style={{ height: `${Math.max(2, (d.rainfall / top) * 100)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-0.5 flex gap-1">
            {days.map((d) => (
              <span key={d.time} className="flex-1 text-center text-[9px] text-slate-400">
                {d.time.slice(8, 10)}/{d.time.slice(5, 7)}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="flex items-start gap-1.5 leading-relaxed text-slate-500 dark:text-slate-400">
        <Cloud size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Biru = hari prakiraan, abu-abu = hari sebelumnya. Hujan hari prakiraan berasal dari model cuaca Open-Meteo,
          hari sebelumnya data tercatat; di mode arsip semuanya data arsip. Kategori mengikuti skala harian BMKG.
        </span>
      </p>
    </div>
  );
};
