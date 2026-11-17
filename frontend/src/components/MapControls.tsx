'use client';

import React, { useState } from 'react';
import {
  Plus,
  Minus,
  Crosshair,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Droplets,
  ShieldAlert,
  Radio,
} from 'lucide-react';
import { BasemapType } from '@/data/types';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  basemap: BasemapType;
  onChangeBasemap: (basemap: BasemapType) => void;
  layers: {
    heatmap: boolean;
    waterGates: boolean;
    evacuation: boolean;
    radarPulse: boolean;
  };
  onToggleLayer: (layer: keyof MapControlsProps['layers']) => void;
  /** True when the map shows real backend data. Layers that only exist as demo data are then switched off. */
  hasRealData: boolean;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetView,
  basemap,
  onChangeBasemap,
  layers,
  onToggleLayer,
  hasRealData,
}) => {
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 select-none">
      {/* Zoom and Re-center Widget */}
      <div className="rounded-xl shadow-lg p-1 flex flex-col gap-1 backdrop-blur-md border border-[#22396F] bg-[#FFEBCC]/95 dark:border-[#22396F] dark:bg-[#0D1C42]/95">
        <button
          onClick={onZoomIn}
          className="p-2 text-[#010736] hover:bg-[#FFF9D2] dark:text-[#FCF1D0] dark:hover:bg-[#22396F] rounded-lg transition-colors flex items-center justify-center"
          title="Zoom In"
        >
          <Plus size={18} />
        </button>
        <div className="h-[1px] bg-[#BFDDF0] dark:bg-[#22396F] mx-1" />
        <button
          onClick={onZoomOut}
          className="p-2 text-[#010736] hover:bg-[#FFF9D2] dark:text-[#FCF1D0] dark:hover:bg-[#22396F] rounded-lg transition-colors flex items-center justify-center"
          title="Zoom Out"
        >
          <Minus size={18} />
        </button>
        <div className="h-[1px] bg-[#BFDDF0] dark:bg-[#22396F] mx-1" />
        <button
          onClick={onResetView}
          className="p-2 text-[#010736] hover:bg-[#FFF9D2] dark:text-[#FCF1D0] dark:hover:bg-[#22396F] rounded-lg transition-colors flex items-center justify-center"
          title="Pusatkan ke Jabodetabek"
        >
          <Crosshair size={18} />
        </button>
      </div>

      {/* Basemap and Layers Switcher Widget */}
      <div className="relative">
        <div className="rounded-xl shadow-lg p-1 flex flex-col gap-1 backdrop-blur-md border border-[#22396F] bg-[#FFEBCC]/95 dark:border-[#22396F] dark:bg-[#0D1C42]/95">
          {/* Layer toggles button */}
          <button
            onClick={() => {
              setShowLayersMenu(!showLayersMenu);
              setShowBasemapMenu(false);
            }}
            className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
              showLayersMenu
                ? 'bg-[#8CC0EB] text-[#010736] shadow-sm dark:bg-[#22396F] dark:text-[#FCF1D0]'
                : 'text-[#010736] hover:bg-[#FFF9D2] dark:text-[#FCF1D0] dark:hover:bg-[#22396F]'
            }`}
            title="Pengaturan Layer"
          >
            <Layers size={18} />
          </button>

          {/* Basemap style button */}
          <button
            onClick={() => {
              setShowBasemapMenu(!showBasemapMenu);
              setShowLayersMenu(false);
            }}
            className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
              showBasemapMenu
                ? 'bg-[#8CC0EB] text-[#010736] shadow-sm dark:bg-[#22396F] dark:text-[#FCF1D0]'
                : 'text-[#010736] hover:bg-[#FFF9D2] dark:text-[#FCF1D0] dark:hover:bg-[#22396F]'
            }`}
            title="Gaya Peta Basemap"
          >
            <MapIcon size={18} />
          </button>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-[#010736] hover:bg-[#FFF9D2] dark:text-[#FCF1D0] dark:hover:bg-[#22396F] rounded-lg transition-colors flex items-center justify-center"
            title="Layar Penuh"
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>

        {/* Layers Flyout Menu */}
        {showLayersMenu && (
          <div className="absolute left-full bottom-0 ml-2 rounded-xl p-3 shadow-2xl w-60 z-50 border border-[#22396F] bg-[#FFEBCC] text-[#010736] dark:border-[#22396F] dark:bg-[#0D1C42] dark:text-[#FCF1D0] animate-in fade-in zoom-in-95 duration-150">
            {hasRealData && (
              <div className="mb-2 text-[10px] leading-tight text-amber-700 dark:text-amber-300 text-justify">
                Pintu air, posko, dan radar dimatikan: belum ada sumber data nyata untuk layer ini.
              </div>
            )}
            <div className="space-y-2">
              <label className="flex items-center justify-between text-xs cursor-pointer hover:bg-[#8CC0EB]/20 dark:hover:bg-[#22396F]/50 p-1.5 rounded-lg transition-colors">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#8CC0EB] dark:bg-[#FCF1D0]" />
                  Grid Heatmap Banjir
                </span>
                <input
                  type="checkbox"
                  checked={layers.heatmap}
                  onChange={() => onToggleLayer('heatmap')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer hover:bg-[#8CC0EB]/20 dark:hover:bg-[#22396F]/50 p-1.5 rounded-lg transition-colors">
                <span className="flex items-center gap-2">
                  <Droplets size={13} className="text-[#010736] dark:text-[#FCF1D0]" />
                  Pos Pantau / Pintu Air
                </span>
                <input
                  type="checkbox"
                  checked={layers.waterGates && !hasRealData}
                  disabled={hasRealData}
                  onChange={() => onToggleLayer('waterGates')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer hover:bg-[#8CC0EB]/20 dark:hover:bg-[#22396F]/50 p-1.5 rounded-lg transition-colors">
                <span className="flex items-center gap-2">
                  <ShieldAlert size={13} className="text-[#010736] dark:text-[#FCF1D0]" />
                  Posko Pengungsian
                </span>
                <input
                  type="checkbox"
                  checked={layers.evacuation && !hasRealData}
                  disabled={hasRealData}
                  onChange={() => onToggleLayer('evacuation')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer hover:bg-[#8CC0EB]/20 dark:hover:bg-[#22396F]/50 p-1.5 rounded-lg transition-colors">
                <span className="flex items-center gap-2">
                  <Radio size={13} className="text-[#010736] dark:text-[#FCF1D0]" />
                  Radar Reflektivitas
                </span>
                <input
                  type="checkbox"
                  checked={layers.radarPulse && !hasRealData}
                  disabled={hasRealData}
                  onChange={() => onToggleLayer('radarPulse')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>
        )}

        {/* Basemap Selection Flyout */}
        {showBasemapMenu && (
          <div className="absolute left-full bottom-0 ml-2 rounded-xl p-3 shadow-2xl w-52 z-50 border border-[#22396F] bg-[#FFEBCC] text-[#010736] dark:border-[#22396F] dark:bg-[#0D1C42] dark:text-[#FCF1D0] animate-in fade-in zoom-in-95 duration-150">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#010736] dark:text-[#FCF1D0] mb-2.5 pb-1 border-b border-[#22396F] dark:border-[#22396F]">
              Gaya Peta (Basemap)
            </div>
            <div className="space-y-1.5">
              {[
                { id: 'dark', label: 'Dark Mode (Free OSM)', desc: 'Mode Gelap NOAA Tanpa API Key' },
                { id: 'topographic', label: 'OpenTopoMap (Topografi)', desc: 'Kontur Sungai & Elevasi NOAA' },
                { id: 'osm', label: 'OSM Humanitarian (HOT)', desc: 'Peta Khusus Mitigasi Bencana' },
              ].map((mapOption) => (
                <button
                  key={mapOption.id}
                  onClick={() => {
                    onChangeBasemap(mapOption.id as BasemapType);
                    setShowBasemapMenu(false);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs transition-all ${
                    basemap === mapOption.id
                      ? 'bg-[#8CC0EB] text-[#010736] font-semibold shadow-xs dark:bg-[#22396F] dark:text-[#FCF1D0]'
                      : 'hover:bg-[#8CC0EB]/20 text-[#010736] dark:text-[#FCF1D0] dark:hover:bg-[#22396F]/50'
                  }`}
                >
                  <div className="font-semibold">{mapOption.label}</div>
                  <div className={`text-[10px] ${basemap === mapOption.id ? 'text-[#010736]/80 dark:text-[#FCF1D0]/80' : 'text-[#22396F] dark:text-[#BFDDF0]'}`}>
                    {mapOption.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
