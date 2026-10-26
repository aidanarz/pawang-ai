'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  TimeHorizon,
  BasemapType,
  GeoJSONGridFeature,
  AreaAnalysisResponse,
} from '@/data/types';
import {
  WATER_GATE_STATIONS,
  EVACUATION_CENTERS,
  BASE_FLOOD_ZONES,
  getAnalysisForGrid,
} from '@/data/floodData';
import { BrandingHeader } from './BrandingHeader';
import { RightSidebar } from './RightSidebar';
import { HeatmapLegend } from './HeatmapLegend';
import { MapControls } from './MapControls';
import { SearchModal } from './SearchModal';

// Dynamically import LeafletMap with SSR disabled
const LeafletMap = dynamic(
  () => import('./LeafletMap').then((mod) => mod.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-mono tracking-wider">Memuat GIS Engine Pawang AI...</span>
      </div>
    ),
  }
);

export const MapDashboard: React.FC = () => {
  // App States
  const [selectedGridId, setSelectedGridId] = useState<string>('JKT-KML-01');
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>('5h');
  const [features, setFeatures] = useState<GeoJSONGridFeature[]>(BASE_FLOOD_ZONES);
  const [analysis, setAnalysis] = useState<AreaAnalysisResponse | null>(() =>
    getAnalysisForGrid('JKT-KML-01')
  );
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [basemap, setBasemap] = useState<BasemapType>('dark');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [activeRainThreshold, setActiveRainThreshold] = useState<number | null>(null);

  const [layers, setLayers] = useState({
    heatmap: true,
    waterGates: true,
    evacuation: true,
    radarPulse: true,
  });

  // Sync theme with document classList
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Fetch heatmap data when timeHorizon changes
  useEffect(() => {
    let isMounted = true;
    const loadHeatmap = async () => {
      try {
        const res = await fetch(`/api/v1/heatmap?time=${timeHorizon}`);
        if (res.ok && isMounted) {
          const json = await res.json();
          setFeatures(json.features);
        }
      } catch (err) {
        console.error('Error fetching heatmap:', err);
      }
    };
    loadHeatmap();
    return () => {
      isMounted = false;
    };
  }, [timeHorizon]);

  // Fetch analysis data when selectedGridId changes
  useEffect(() => {
    if (!selectedGridId) return;
    let isMounted = true;
    const loadAnalysis = async () => {
      try {
        const res = await fetch(`/api/v1/analysis?grid_id=${selectedGridId}`);
        if (res.ok && isMounted) {
          const json: AreaAnalysisResponse = await res.json();
          setAnalysis(json);
        }
      } catch (err) {
        console.error('Error fetching analysis:', err);
      }
    };
    loadAnalysis();
    return () => {
      isMounted = false;
    };
  }, [selectedGridId]);

  // Forecast Timeline Simulation Loop
  useEffect(() => {
    if (!isSimulating) return;

    const horizons: TimeHorizon[] = ['1h', '3h', '5h', '12h', '24h'];
    const interval = setInterval(() => {
      setTimeHorizon((prev) => {
        const idx = horizons.indexOf(prev);
        const nextIdx = (idx + 1) % horizons.length;
        return horizons[nextIdx];
      });
    }, 2800);

    return () => clearInterval(interval);
  }, [isSimulating]);

  // Theme toggle handler
  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    setBasemap(nextTheme === 'dark' ? 'dark' : 'positron');
  };

  // Layer toggle handler
  const handleToggleLayer = (layerKey: keyof typeof layers) => {
    setLayers((prev) => ({
      ...prev,
      [layerKey]: !prev[layerKey],
    }));
  };

  // Zoom controls triggering Leaflet via custom events
  const handleZoomIn = () => {
    window.dispatchEvent(new CustomEvent('pawang:zoomin'));
  };

  const handleZoomOut = () => {
    window.dispatchEvent(new CustomEvent('pawang:zoomout'));
  };

  const handleResetView = () => {
    window.dispatchEvent(new CustomEvent('pawang:reset'));
  };

  const highRiskCount = features.filter(
    (f) => f.properties.risk_level === 'High' || f.properties.risk_level === 'Extreme'
  ).length;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* 1. Fullscreen Base Leaflet Map */}
      <div className="absolute inset-0 z-0">
        <LeafletMap
          features={features}
          selectedGridId={selectedGridId}
          onSelectFeature={(gridId) => setSelectedGridId(gridId)}
          basemap={basemap}
          theme={theme}
          timeHorizon={timeHorizon}
          layers={layers}
          waterGates={WATER_GATE_STATIONS}
          evacuationCenters={EVACUATION_CENTERS}
          activeRainThreshold={activeRainThreshold}
        />
      </div>

      {/* 2. Top-Left Floating Branding Header */}
      <header className="absolute top-4 left-4 z-30 max-w-[calc(100vw-32px)]">
        <BrandingHeader
          onOpenSearch={() => setIsSearchOpen(true)}
          highRiskCount={highRiskCount}
        />
      </header>

      {/* 3. Bottom-Left Quick Status Indicator */}
      <div className="hidden lg:flex absolute bottom-4 left-4 z-30 glass-panel rounded-xl px-3 py-2 shadow-lg backdrop-blur-md text-[11px] text-slate-500 dark:text-slate-400 items-center gap-2 border border-slate-200/50 dark:border-slate-800/60">
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          Pusat Pemantauan:
        </span>
        <span>Jabodetabek Basin Grid</span>
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <span className="font-mono text-blue-600 dark:text-blue-400">
          -6.2088, 106.8456
        </span>
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <span>{features.length} Daerah Terpantau</span>
      </div>

      {/* 4. Bottom-Right Controls & Heatmap Legend */}
      <div className="absolute bottom-4 right-4 sm:right-6 z-30 flex flex-col items-end gap-2.5 max-w-[calc(100vw-32px)] sm:max-w-md">
        {/* Map View Controls (Zoom, Layers, Basemap) */}
        <div className="self-end">
          <MapControls
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetView={handleResetView}
            basemap={basemap}
            onChangeBasemap={(b) => setBasemap(b)}
            layers={layers}
            onToggleLayer={handleToggleLayer}
          />
        </div>

        {/* NOAA-Inspired Heatmap Legend */}
        <div className="w-full sm:w-84">
          <HeatmapLegend
            activeRainThreshold={activeRainThreshold}
            onSelectThreshold={(t) => setActiveRainThreshold(t)}
          />
        </div>
      </div>

      {/* 5. Right Sidebar (Floating / Slide-out Panel) */}
      <RightSidebar
        analysis={analysis}
        isLoading={false}
        timeHorizon={timeHorizon}
        onChangeTimeHorizon={(h) => setTimeHorizon(h)}
        isSimulating={isSimulating}
        onToggleSimulation={() => setIsSimulating(!isSimulating)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSelectRegionById={(gridId) => setSelectedGridId(gridId)}
        onOpenSearchModal={() => setIsSearchOpen(true)}
      />

      {/* 6. Spotlight Search Modal (⌘F / Ctrl+K) */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectRegion={(gridId) => setSelectedGridId(gridId)}
      />
    </main>
  );
};
