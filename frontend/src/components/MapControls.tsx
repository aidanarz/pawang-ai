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
      <div className="flex flex-col gap-1 rounded-2xl border border-[#DADCE0] bg-white/95 p-1 shadow-md backdrop-blur-md dark:border-[#3C4043] dark:bg-[#202124]/95">
        <button
          onClick={onZoomIn}
          className="flex items-center justify-center rounded-xl p-2 text-[#5F6368] transition hover:bg-[#F1F3F4] hover:text-[#202124] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D] dark:hover:text-[#E8EAED]"
          title="Zoom In"
        >
          <Plus size={18} />
        </button>
        <div className="mx-1.5 h-px bg-[#DADCE0] dark:bg-[#3C4043]" />
        <button
          onClick={onZoomOut}
          className="flex items-center justify-center rounded-xl p-2 text-[#5F6368] transition hover:bg-[#F1F3F4] hover:text-[#202124] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D] dark:hover:text-[#E8EAED]"
          title="Zoom Out"
        >
          <Minus size={18} />
        </button>
        <div className="mx-1.5 h-px bg-[#DADCE0] dark:bg-[#3C4043]" />
        <button
          onClick={onResetView}
          className="flex items-center justify-center rounded-xl p-2 text-[#5F6368] transition hover:bg-[#F1F3F4] hover:text-[#1A73E8] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D] dark:hover:text-[#8AB4F8]"
          title="Pusatkan ke Jabodetabek"
        >
          <Crosshair size={18} />
        </button>
      </div>

      {/* Basemap and Layers Switcher Widget */}
      <div className="relative">
        <div className="flex flex-col gap-1 rounded-2xl border border-[#DADCE0] bg-white/95 p-1 shadow-md backdrop-blur-md dark:border-[#3C4043] dark:bg-[#202124]/95">
          {/* Layer toggles button */}
          <button
            onClick={() => {
              setShowLayersMenu(!showLayersMenu);
              setShowBasemapMenu(false);
            }}
            className={`flex items-center justify-center rounded-xl p-2 transition ${
              showLayersMenu
                ? 'bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]'
                : 'text-[#5F6368] hover:bg-[#F1F3F4] hover:text-[#202124] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D] dark:hover:text-[#E8EAED]'
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
            className={`flex items-center justify-center rounded-xl p-2 transition ${
              showBasemapMenu
                ? 'bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]'
                : 'text-[#5F6368] hover:bg-[#F1F3F4] hover:text-[#202124] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D] dark:hover:text-[#E8EAED]'
            }`}
            title="Gaya Peta Basemap"
          >
            <MapIcon size={18} />
          </button>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center justify-center rounded-xl p-2 text-[#5F6368] transition hover:bg-[#F1F3F4] hover:text-[#202124] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D] dark:hover:text-[#E8EAED]"
            title="Layar Penuh"
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>

        {/* Layers Flyout Menu */}
        {showLayersMenu && (
          <div className="absolute bottom-0 left-full z-50 ml-2 w-60 animate-in fade-in zoom-in-95 duration-150 rounded-2xl border border-[#DADCE0] bg-white p-3 text-[#202124] shadow-xl dark:border-[#3C4043] dark:bg-[#202124] dark:text-[#E8EAED]">
            {hasRealData && (
              <div className="mb-2 rounded-xl bg-[#FEF7E0] p-2 text-[10px] leading-relaxed text-[#7A4F01] dark:bg-[#F9AB00]/10 dark:text-[#FDD663]">
                Pintu air, posko, dan radar dimatikan: belum ada sumber data nyata untuk layer ini.
              </div>
            )}
            <div className="space-y-1">
              <label className="flex cursor-pointer items-center justify-between rounded-xl p-2 text-xs transition hover:bg-[#F1F3F4] dark:hover:bg-[#292A2D]">
                <span className="flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#1A73E8] dark:bg-[#8AB4F8]" />
                  Grid Heatmap Banjir
                </span>
                <input
                  type="checkbox"
                  checked={layers.heatmap}
                  onChange={() => onToggleLayer('heatmap')}
                  className="rounded accent-[#1A73E8] dark:accent-[#8AB4F8]"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl p-2 text-xs transition hover:bg-[#F1F3F4] dark:hover:bg-[#292A2D]">
                <span className="flex items-center gap-2 font-medium">
                  <Droplets size={13} className="text-[#1A73E8] dark:text-[#8AB4F8]" />
                  Pos Pantau / Pintu Air
                </span>
                <input
                  type="checkbox"
                  checked={layers.waterGates && !hasRealData}
                  disabled={hasRealData}
                  onChange={() => onToggleLayer('waterGates')}
                  className="rounded accent-[#1A73E8] dark:accent-[#8AB4F8]"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl p-2 text-xs transition hover:bg-[#F1F3F4] dark:hover:bg-[#292A2D]">
                <span className="flex items-center gap-2 font-medium">
                  <ShieldAlert size={13} className="text-[#1A73E8] dark:text-[#8AB4F8]" />
                  Posko Pengungsian
                </span>
                <input
                  type="checkbox"
                  checked={layers.evacuation && !hasRealData}
                  disabled={hasRealData}
                  onChange={() => onToggleLayer('evacuation')}
                  className="rounded accent-[#1A73E8] dark:accent-[#8AB4F8]"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl p-2 text-xs transition hover:bg-[#F1F3F4] dark:hover:bg-[#292A2D]">
                <span className="flex items-center gap-2 font-medium">
                  <Radio size={13} className="text-[#1A73E8] dark:text-[#8AB4F8]" />
                  Radar Reflektivitas
                </span>
                <input
                  type="checkbox"
                  checked={layers.radarPulse && !hasRealData}
                  disabled={hasRealData}
                  onChange={() => onToggleLayer('radarPulse')}
                  className="rounded accent-[#1A73E8] dark:accent-[#8AB4F8]"
                />
              </label>
            </div>
          </div>
        )}

        {/* Basemap Selection Flyout */}
        {showBasemapMenu && (
          <div className="absolute bottom-0 left-full z-50 ml-2 w-56 animate-in fade-in zoom-in-95 duration-150 rounded-2xl border border-[#DADCE0] bg-white p-3 text-[#202124] shadow-xl dark:border-[#3C4043] dark:bg-[#202124] dark:text-[#E8EAED]">
            <div className="mb-2 border-b border-[#DADCE0] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F6368] dark:border-[#3C4043] dark:text-[#9AA0A6]">
              Gaya Peta
            </div>
            <div className="space-y-1">
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
                  className={`w-full rounded-xl p-2 text-left text-xs transition ${
                    basemap === mapOption.id
                      ? 'bg-[#E8F0FE] font-semibold text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]'
                      : 'text-[#202124] hover:bg-[#F1F3F4] dark:text-[#E8EAED] dark:hover:bg-[#292A2D]'
                  }`}
                >
                  <div className="font-semibold">{mapOption.label}</div>
                  <div
                    className={`text-[10px] ${
                      basemap === mapOption.id
                        ? 'text-[#1A73E8]/80 dark:text-[#8AB4F8]/80'
                        : 'text-[#5F6368] dark:text-[#9AA0A6]'
                    }`}
                  >
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
