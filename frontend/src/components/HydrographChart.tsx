'use client';

import React from 'react';
import { HydrographPoint } from '@/data/types';

interface HydrographChartProps {
  data: HydrographPoint[];
}

export const HydrographChart: React.FC<HydrographChartProps> = ({ data }) => {
  if (!data || data.length === 0) return null;

  // Compute min and max for scaling
  const maxLevel = Math.max(...data.map((d) => d.waterLevel)) * 1.15;
  const minLevel = Math.min(...data.map((d) => d.waterLevel)) * 0.8;
  const range = maxLevel - minLevel || 1;

  const width = 320;
  const height = 110;
  const padding = { top: 12, right: 12, bottom: 22, left: 32 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const getX = (index: number) => {
    return padding.left + (index / (data.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    return padding.top + graphHeight - ((val - minLevel) / range) * graphHeight;
  };

  // Build SVG paths
  const linePoints = data.map((d, i) => `${getX(i)},${getY(d.waterLevel)}`).join(' ');
  const areaPoints = `${getX(0)},${padding.top + graphHeight} ${linePoints} ${getX(data.length - 1)},${padding.top + graphHeight}`;



  // Real data (from the backend) is a daily water level (TMA) with date labels. The built-in demo
  // data is a flood-height series with clock labels and a danger line.
  const isWaterLevelSeries = /^\d{4}-\d{2}-\d{2}$/.test(data[0].time);
  const maxWaterLevel = Math.max(...data.map((point) => point.waterLevel));
  const strokeColor = isWaterLevelSeries
    ? '#38BDF8'
    : maxWaterLevel >= 100 ? '#EF4444' : maxWaterLevel >= 60 ? '#EAB308' : '#22C55E';
  const formatTime = (t: string) => (isWaterLevelSeries ? `${t.slice(8, 10)}/${t.slice(5, 7)}` : t);

  return (
    <div className="w-full pt-1">
      <div className="flex items-center justify-between text-[11px] mb-1.5 px-0.5">
        <span className="font-semibold text-[#010736] dark:text-[#FCF1D0] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: strokeColor }} />
          {isWaterLevelSeries ? 'Muka air sungai/pintu air, maks. harian (cm)' : 'Tinggi Banjir (cm)'}
        </span>
        <span className="text-[#22396F] dark:text-[#BFDDF0] font-mono text-[10px]">
          {isWaterLevelSeries ? 'teramati, bukan tinggi genangan' : 'Semua titik'}
        </span>
      </div>

      <div className="relative bg-[#FFF9D2]/70 dark:bg-[#010736]/70 rounded-lg p-1.5 border border-[#22396F] dark:border-[#22396F] overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="hydroFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={padding.left}
            y1={padding.top + graphHeight * 0.33}
            x2={width - padding.right}
            y2={padding.top + graphHeight * 0.33}
            stroke="currentColor"
            strokeDasharray="2,2"
            className="text-[#BFDDF0] dark:text-[#22396F]"
          />
          <line
            x1={padding.left}
            y1={padding.top + graphHeight * 0.66}
            x2={width - padding.right}
            y2={padding.top + graphHeight * 0.66}
            stroke="currentColor"
            strokeDasharray="2,2"
            className="text-[#BFDDF0] dark:text-[#22396F]"
          />

          {/* Area Fill */}
          <polygon points={areaPoints} fill="url(#hydroFill)" />

          {/* Line Chart */}
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={linePoints}
          />

          {/* Data Points */}
          {data.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.waterLevel);
            return (
              <g key={i}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={strokeColor}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                <text
                  x={cx}
                  y={cy - 7}
                  textAnchor="middle"
                  className="text-[8px] font-bold fill-[#010736] dark:fill-[#FCF1D0] font-mono"
                >
                  {d.waterLevel}
                </text>
                {/* Time labels */}
                <text
                  x={cx}
                  y={height - 4}
                  textAnchor="middle"
                  className="text-[8.5px] fill-[#22396F] dark:fill-[#BFDDF0] font-mono"
                >
                  {formatTime(d.time)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
