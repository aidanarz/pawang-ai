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
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetView,
  basemap,
  onChangeBasemap,
  layers,
  onToggleLayer,
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
      <div className="glass-panel rounded-xl shadow-lg p-1 flex flex-col gap-1 backdrop-blur-md">
        <button
          onClick={onZoomIn}
          className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center"
          title="Zoom In"
        >
          <Plus size={18} />
        </button>
        <div className="h-[1px] bg-slate-200/60 dark:bg-slate-800/80 mx-1" />
        <button
          onClick={onZoomOut}
          className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center"
          title="Zoom Out"
        >
          <Minus size={18} />
        </button>
        <div className="h-[1px] bg-slate-200/60 dark:bg-slate-800/80 mx-1" />
        <button
          onClick={onResetView}
          className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center"
          title="Pusatkan ke Jabodetabek"
        >
          <Crosshair size={18} />
        </button>
      </div>

      {/* Basemap and Layers Switcher Widget */}
      <div className="relative">
        <div className="glass-panel rounded-xl shadow-lg p-1 flex flex-col gap-1 backdrop-blur-md">
          {/* Layer toggles button */}
          <button
            onClick={() => {
              setShowLayersMenu(!showLayersMenu);
              setShowBasemapMenu(false);
            }}
            className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
              showLayersMenu
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Gaya Peta Basemap"
          >
            <MapIcon size={18} />
          </button>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center"
            title="Layar Penuh"
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>

        {/* Layers Flyout Menu */}
        {showLayersMenu && (
          <div className="absolute right-12 bottom-0 glass-panel rounded-xl p-3 shadow-2xl w-60 z-50 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 pb-1 border-b border-slate-200 dark:border-slate-800">
              Layer Aktif
            </div>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-xs cursor-pointer hover:bg-slate-500/10 p-1.5 rounded-lg transition-colors">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  Grid Heatmap Banjir
                </span>
                <input
                  type="checkbox"
                  checked={layers.heatmap}
                  onChange={() => onToggleLayer('heatmap')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer hover:bg-slate-500/10 p-1.5 rounded-lg transition-colors">
                <span className="flex items-center gap-2">
                  <Droplets size={13} className="text-blue-500" />
                  Pos Pantau / Pintu Air
                </span>
                <input
                  type="checkbox"
                  checked={layers.waterGates}
                  onChange={() => onToggleLayer('waterGates')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer hover:bg-slate-500/10 p-1.5 rounded-lg transition-colors">
                <span className="flex items-center gap-2">
                  <ShieldAlert size={13} className="text-emerald-500" />
                  Posko Pengungsian
                </span>
                <input
                  type="checkbox"
                  checked={layers.evacuation}
                  onChange={() => onToggleLayer('evacuation')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer hover:bg-slate-500/10 p-1.5 rounded-lg transition-colors">
                <span className="flex items-center gap-2">
                  <Radio size={13} className="text-amber-500" />
                  Radar Reflektivitas
                </span>
                <input
                  type="checkbox"
                  checked={layers.radarPulse}
                  onChange={() => onToggleLayer('radarPulse')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>
        )}

        {/* Basemap Selection Flyout */}
        {showBasemapMenu && (
          <div className="absolute right-12 bottom-0 glass-panel rounded-xl p-3 shadow-2xl w-52 z-50 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 pb-1 border-b border-slate-200 dark:border-slate-800">
              Gaya Peta (Basemap)
            </div>
            <div className="space-y-1.5">
              {[
                { id: 'dark', label: 'Dark Mode (Free OSM)', desc: 'Mode Gelap NOAA Tanpa API Key' },
                { id: 'positron', label: 'OpenStreetMap (Light)', desc: 'Mode Terang Bebas & Cepat' },
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
                      ? 'bg-blue-600 text-white font-semibold shadow-md'
                      : 'hover:bg-slate-500/10 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div>{mapOption.label}</div>
                  <div className={`text-[10px] ${basemap === mapOption.id ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>
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
