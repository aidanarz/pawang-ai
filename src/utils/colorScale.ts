import { RiskLevel, SiagaLevel } from '@/data/types';

/**
 * Pawang AI NOAA-Inspired Legend Scale:
 * mm: 1.5 | 2 | 3 | 7 | 10 | 20 | 30+
 * Transition: Yellow -> Orange -> Purple -> Deep Magenta
 */
export const LEGEND_STOPS = [
  { mm: 1.5, label: '1.5', color: '#FDE047', risk: 'Low', desc: 'Hujan Ringan / Rendah' },
  { mm: 2.0, label: '2', color: '#FACC15', risk: 'Low', desc: 'Potensi Genangan Ringan' },
  { mm: 3.0, label: '3', color: '#FB923C', risk: 'Medium', desc: 'Genangan Sedang (10-25cm)' },
  { mm: 7.0, label: '7', color: '#F97316', risk: 'Medium', desc: 'Hujan Lebat / Waspada' },
  { mm: 10.0, label: '10', color: '#C084FC', risk: 'High', desc: 'Banjir Lokal (30-60cm)' },
  { mm: 20.0, label: '20', color: '#9333EA', risk: 'High', desc: 'Banjir Luas / Siaga 2' },
  { mm: 30.0, label: '30+', color: '#C026D3', risk: 'Extreme', desc: 'Banjir Parah / Siaga 1' },
];

/**
 * Returns color hex code based on rainfall mm
 */
export function getColorForRainfall(rainfallMm: number): string {
  if (rainfallMm < 2) return '#FDE047'; // Soft yellow
  if (rainfallMm < 4) return '#FACC15'; // Yellow
  if (rainfallMm < 7) return '#FB923C'; // Light orange
  if (rainfallMm < 12) return '#F97316'; // Deep orange
  if (rainfallMm < 20) return '#C084FC'; // Medium purple
  if (rainfallMm < 30) return '#9333EA'; // Deep purple
  return '#C026D3'; // Deep magenta
}

/**
 * Returns fill color and opacity for GeoJSON grid cell
 */
export function getStyleForGrid(riskLevel: RiskLevel, floodProb: number, isSelected: boolean = false) {
  let fillColor = '#FACC15';
  let strokeColor = '#CA8A04';

  switch (riskLevel) {
    case 'Low':
      fillColor = '#FACC15'; // Yellow
      strokeColor = '#CA8A04';
      break;
    case 'Medium':
      fillColor = '#F97316'; // Orange
      strokeColor = '#EA580C';
      break;
    case 'High':
      fillColor = '#A855F7'; // Purple
      strokeColor = '#7E22CE';
      break;
    case 'Extreme':
      fillColor = '#D946EF'; // Deep Magenta
      strokeColor = '#A21CAF';
      break;
  }

  // Base opacity on flood probability (clamped between 0.40 and 0.85)
  const fillOpacity = Math.max(0.40, Math.min(0.85, floodProb * 0.9));

  return {
    fillColor,
    fillOpacity: isSelected ? 0.90 : fillOpacity,
    color: isSelected ? '#38BDF8' : strokeColor,
    weight: isSelected ? 3.5 : 1.5,
    dashArray: isSelected ? '4, 4' : undefined,
  };
}

/**
 * Returns UI badge styling classes for RiskLevel
 */
export function getRiskBadgeClasses(risk: RiskLevel): {
  bg: string;
  text: string;
  border: string;
  dot: string;
  label: string;
} {
  switch (risk) {
    case 'Low':
      return {
        bg: 'bg-yellow-500/15 dark:bg-yellow-500/25',
        text: 'text-yellow-700 dark:text-yellow-300',
        border: 'border-yellow-400/40',
        dot: 'bg-yellow-400',
        label: 'Low Risk',
      };
    case 'Medium':
      return {
        bg: 'bg-orange-500/15 dark:bg-orange-500/25',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-400/40',
        dot: 'bg-orange-400',
        label: 'Medium Risk',
      };
    case 'High':
      return {
        bg: 'bg-purple-500/15 dark:bg-purple-500/25',
        text: 'text-purple-700 dark:text-purple-300',
        border: 'border-purple-400/40',
        dot: 'bg-purple-400',
        label: 'High Risk',
      };
    case 'Extreme':
      return {
        bg: 'bg-fuchsia-600/15 dark:bg-fuchsia-600/30',
        text: 'text-fuchsia-700 dark:text-fuchsia-300',
        border: 'border-fuchsia-500/50',
        dot: 'bg-fuchsia-500',
        label: 'Extreme Risk',
      };
  }
}

/**
 * Returns styling for Siaga levels (Normal, Siaga 4, 3, 2, 1)
 */
export function getSiagaBadgeClasses(siaga: SiagaLevel): {
  bg: string;
  text: string;
  border: string;
} {
  switch (siaga) {
    case 'Normal':
      return {
        bg: 'bg-emerald-500/15 dark:bg-emerald-500/25',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-400/30',
      };
    case 'Siaga 4':
      return {
        bg: 'bg-blue-500/15 dark:bg-blue-500/25',
        text: 'text-blue-700 dark:text-blue-300',
        border: 'border-blue-400/30',
      };
    case 'Siaga 3':
      return {
        bg: 'bg-yellow-500/15 dark:bg-yellow-500/25',
        text: 'text-yellow-700 dark:text-yellow-300',
        border: 'border-yellow-400/30',
      };
    case 'Siaga 2':
      return {
        bg: 'bg-orange-500/15 dark:bg-orange-500/25',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-400/30',
      };
    case 'Siaga 1':
      return {
        bg: 'bg-rose-500/20 dark:bg-rose-500/30',
        text: 'text-rose-700 dark:text-rose-300',
        border: 'border-rose-500/50',
      };
  }
}
