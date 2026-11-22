'use client';

import React, { useState } from 'react';
import {
  Plus,
  Minus,
  Crosshair,
  Map as MapIcon,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { BasemapType } from '@/data/types';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  basemap: BasemapType;
  onChangeBasemap: (basemap: BasemapType) => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetView,
  basemap,
  onChangeBasemap,
}) => {
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
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
          {/* Basemap style button */}
          <button
            onClick={() => {
              setShowBasemapMenu(!showBasemapMenu);
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
