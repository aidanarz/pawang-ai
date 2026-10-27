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
import { RightSidebar } from './RightSidebar';
import { HeatmapLegend } from './HeatmapLegend';
import { MapControls } from './MapControls';
import { SearchModal } from './SearchModal';
import { TopStatusPill } from './TopStatusPill';
import { Attribution } from './Attribution';

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
          basemap={basemap}
          theme={theme}
          timeHorizon={timeHorizon}
          layers={layers}
          waterGates={WATER_GATE_STATIONS}
          evacuationCenters={EVACUATION_CENTERS}
          activeRainThreshold={activeRainThreshold}
        />
      </div>

      {/* 2. Top status, centered independently from the map controls */}
      <header className="absolute top-4 left-1/2 z-30 -translate-x-1/2">
        <TopStatusPill highRiskCount={highRiskCount} />
      </header>

      {/* 3. Center-left map controls */}
      <div className="absolute left-4 top-1/2 z-30 -translate-y-1/2">
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

      {/* 4. Minimal heatmap legend above the source attribution */}
      <div className="absolute bottom-12 left-3 z-30">
        <HeatmapLegend
          activeRainThreshold={activeRainThreshold}
          onSelectThreshold={(t) => setActiveRainThreshold(t)}
        />
      </div>

      <Attribution />

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
