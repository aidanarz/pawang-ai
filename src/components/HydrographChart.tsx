'use client';

import React from 'react';
import { HydrographPoint } from '@/data/types';

interface HydrographChartProps {
  data: HydrographPoint[];
  riskLevel: string;
}

export const HydrographChart: React.FC<HydrographChartProps> = ({ data, riskLevel }) => {
  if (!data || data.length === 0) return null;

  // Compute min and max for scaling
  const maxLevel = Math.max(...data.map((d) => Math.max(d.waterLevel, d.threshold))) * 1.15;
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

  const thresholdY = getY(data[0].threshold);

  const strokeColor =
    riskLevel === 'Extreme'
      ? '#D946EF'
      : riskLevel === 'High'
      ? '#A855F7'
      : riskLevel === 'Medium'
      ? '#F97316'
      : '#EAB308';

  return (
    <div className="w-full pt-1">
      <div className="flex items-center justify-between text-[11px] mb-1.5 px-0.5">
        <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: strokeColor }} />
          Tren Hidrograf (Tinggi Muka Air cm)
        </span>
        <span className="text-red-500 font-mono text-[10px] flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-red-400 inline-block border-t border-dashed border-red-500" />
          Ambang Bahaya: {data[0].threshold}cm
        </span>
      </div>

      <div className="relative bg-slate-900/5 dark:bg-slate-900/40 rounded-lg p-1.5 border border-slate-200/50 dark:border-slate-800/60 overflow-hidden">
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
            className="text-slate-200 dark:text-slate-800/80"
          />
          <line
            x1={padding.left}
            y1={padding.top + graphHeight * 0.66}
            x2={width - padding.right}
            y2={padding.top + graphHeight * 0.66}
            stroke="currentColor"
            strokeDasharray="2,2"
            className="text-slate-200 dark:text-slate-800/80"
          />

          {/* Danger Threshold Line */}
          <line
            x1={padding.left}
            y1={thresholdY}
            x2={width - padding.right}
            y2={thresholdY}
            stroke="#EF4444"
            strokeWidth="1.2"
            strokeDasharray="3,3"
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
            const isPeak = d.waterLevel === Math.max(...data.map((x) => x.waterLevel));
            return (
              <g key={i}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isPeak ? 4.5 : 2.5}
                  fill={isPeak ? '#EF4444' : strokeColor}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                {isPeak && (
                  <text
                    x={cx}
                    y={cy - 7}
                    textAnchor="middle"
                    className="text-[9px] font-bold fill-red-500 font-mono"
                  >
                    {d.waterLevel}cm
                  </text>
                )}
                {/* Time labels */}
                <text
                  x={cx}
                  y={height - 4}
                  textAnchor="middle"
                  className="text-[8.5px] fill-slate-400 dark:fill-slate-500 font-mono"
                >
                  {d.time}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
