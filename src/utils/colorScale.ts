import { RiskLevel, SiagaLevel } from '@/data/types';

/**
 * Pawang AI NOAA-Inspired Legend Scale:
 * mm: 1.5 | 2 | 3 | 7 | 10 | 20 | 30+
 * Transition: Green -> Yellow -> Red
 */
export const LEGEND_STOPS = [
  { mm: 1.5, label: '1.5', color: '#22C55E', risk: 'Low', desc: 'Hujan Ringan / Rendah' },
  { mm: 2.0, label: '2', color: '#84CC16', risk: 'Low', desc: 'Potensi Genangan Ringan' },
  { mm: 3.0, label: '3', color: '#EAB308', risk: 'Medium', desc: 'Genangan Sedang (10-25cm)' },
  { mm: 7.0, label: '7', color: '#FACC15', risk: 'Medium', desc: 'Hujan Lebat / Waspada' },
  { mm: 10.0, label: '10', color: '#F97316', risk: 'High', desc: 'Banjir Lokal (30-60cm)' },
  { mm: 20.0, label: '20', color: '#EF4444', risk: 'High', desc: 'Banjir Luas / Siaga 2' },
  { mm: 30.0, label: '30+', color: '#B91C1C', risk: 'Extreme', desc: 'Banjir Parah / Siaga 1' },
];

/**
 * Returns color hex code based on rainfall mm
 */
export function getColorForRainfall(rainfallMm: number): string {
  if (rainfallMm < 2) return '#22C55E';
  if (rainfallMm < 4) return '#84CC16';
  if (rainfallMm < 7) return '#EAB308';
  if (rainfallMm < 12) return '#FACC15';
  if (rainfallMm < 20) return '#F97316';
  if (rainfallMm < 30) return '#EF4444';
  return '#B91C1C';
}

/**
 * Returns fill color and opacity for GeoJSON grid cell
 */
export function getStyleForGrid(riskLevel: RiskLevel, floodProb: number, isSelected: boolean = false) {
  let fillColor = '#84CC16';
  let strokeColor = '#4D7C0F';

  switch (riskLevel) {
    case 'Low':
      fillColor = '#84CC16';
      strokeColor = '#4D7C0F';
      break;
    case 'Medium':
      fillColor = '#EAB308';
      strokeColor = '#A16207';
      break;
    case 'High':
      fillColor = '#F97316';
      strokeColor = '#C2410C';
      break;
    case 'Extreme':
      fillColor = '#EF4444';
      strokeColor = '#B91C1C';
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
        bg: 'bg-green-500/15 dark:bg-green-500/25',
        text: 'text-green-600 dark:text-green-400',
        border: 'border-green-400/40',
        dot: 'bg-green-500',
        label: 'Low Risk',
      };
    case 'Medium':
      return {
        bg: 'bg-yellow-500/15 dark:bg-yellow-500/25',
        text: 'text-yellow-600 dark:text-yellow-300',
        border: 'border-yellow-400/40',
        dot: 'bg-yellow-500',
        label: 'Medium Risk',
      };
    case 'High':
      return {
        bg: 'bg-red-500/15 dark:bg-red-500/25',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-400/40',
        dot: 'bg-red-500',
        label: 'High Risk',
      };
    case 'Extreme':
      return {
        bg: 'bg-red-600/15 dark:bg-red-600/30',
        text: 'text-red-700 dark:text-red-300',
        border: 'border-red-500/50',
        dot: 'bg-red-600',
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
