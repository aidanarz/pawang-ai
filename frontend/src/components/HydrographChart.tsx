'use client';

import React, { useMemo } from 'react';
import { HydrographPoint } from '@/data/types';

interface HydrographChartProps {
  data: HydrographPoint[];
  currentLevel?: number | null;
}

export const HydrographChart: React.FC<HydrographChartProps> = ({ data, currentLevel }) => {
  // Convert daily timestamps into hourly checkpoints if needed, or preserve existing hourly timestamps
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const labels = ['12 jam lalu', '10', '8', '6', '4', 'Live'];
    const isHourlyLabels = labels.includes(data[0].time);
    if (isHourlyLabels) {
      return data.slice(-6).map((point, index, points) =>
        index === points.length - 1 ? { ...point, time: 'Live' } : point
      );
    }

    const usable = data.filter((point) => point.waterLevel != null);
    const latest = currentLevel ?? usable.at(-1)?.waterLevel ?? usable[0]?.waterLevel;
    if (latest == null) return [];

    const source = usable.slice(-6).map((point) => point.waterLevel);
    if (source.length === 0) return [];

    return labels.map((label, index) => {
      const sourceIndex = source.length < 6
        ? Math.floor((index / 5) * (source.length - 1))
        : index;
      const level = index === 5 ? latest : source[sourceIndex];
      return {
        time: label,
        rainfall: 0,
        waterLevel: level,
        threshold: 0,
      };
    });
  }, [data, currentLevel]);

  if (!chartData || chartData.length === 0) return null;

  // Compute min and max for scaling
  const maxLevel = Math.max(...chartData.map((d) => d.waterLevel ?? 0)) * 1.15;
  const minLevel = Math.min(...chartData.map((d) => d.waterLevel ?? 0)) * 0.8;
  const range = maxLevel - minLevel || 1;

  const width = 320;
  const height = 110;
  const padding = { top: 12, right: 12, bottom: 22, left: 32 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const getX = (index: number) => {
    return padding.left + (index / (chartData.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    return padding.top + graphHeight - ((val - minLevel) / range) * graphHeight;
  };

  // Build SVG paths
  const linePoints = chartData.map((d, i) => `${getX(i)},${getY(d.waterLevel)}`).join(' ');
  const areaPoints = `${getX(0)},${padding.top + graphHeight} ${linePoints} ${getX(chartData.length - 1)},${padding.top + graphHeight}`;

  const maxWaterLevel = Math.max(...chartData.map((point) => point.waterLevel ?? 0));
  const strokeColor =
    maxWaterLevel >= 150 ? '#B8514A' : maxWaterLevel >= 100 ? '#C9733F' : maxWaterLevel >= 60 ? '#CE9F45' : '#71A868';

  return (
    <div className="w-full pt-1">
      <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px]">
        <span className="flex items-center gap-1.5 font-semibold text-[#010736] dark:text-[#FCF1D0]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: strokeColor }} />
          Tinggi Muka Air per Jam (cm)
        </span>
        <span className="font-mono text-[10px] text-[#22396F] dark:text-[#BFDDF0]">
          Pantauan Jam
        </span>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-[#22396F]/40 bg-[#FFF9D2]/70 p-1.5 dark:border-[#22396F] dark:bg-[#010736]/70">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible">
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
          {chartData.map((d, i) => {
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
                  className="fill-[#010736] font-mono text-[8px] font-bold dark:fill-[#FCF1D0]"
                >
                  {d.waterLevel}
                </text>
                {/* Hourly time labels */}
                <text
                  x={cx}
                  y={height - 4}
                  textAnchor="middle"
                  className="fill-[#22396F] font-mono text-[8.5px] dark:fill-[#BFDDF0]"
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
