'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  TimeHorizon,
  BasemapType,
  GeoJSONGridFeature,
  AreaAnalysisResponse,
  BackendStatus,
  DataSource,
  HeatmapGeoJSONResponse,
} from '@/data/types';
import { WATER_GATE_STATIONS, EVACUATION_CENTERS } from '@/data/floodData';
import { DataSourceBanner } from './DataSourceBanner';
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
  const [selectedGridId, setSelectedGridId] = useState<string | null>(null);
  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>('5h');
  const [features, setFeatures] = useState<GeoJSONGridFeature[]>([]);
  const [analysis, setAnalysis] = useState<AreaAnalysisResponse | null>(null);
  const [basemap, setBasemap] = useState<BasemapType>('dark');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Data source: 'loading' until the first heatmap answer, then 'backend' (model) or 'mock' (demo data).
  const [dataSource, setDataSource] = useState<DataSource>('loading');
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  // Archive day for replay mode. Null in live mode (the backend derives the day from the time horizon).
  const [archiveDate, setArchiveDate] = useState<string | null>(null);

  const [layers, setLayers] = useState({
    heatmap: true,
    waterGates: true,
    evacuation: true,
    radarPulse: true,
  });

  const hasRealData = dataSource === 'backend';

  // Pawang AI uses a single dark dashboard theme.
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Ask once whether the backend is up and, in replay mode, which days it can serve.
  useEffect(() => {
    let isMounted = true;
    const loadStatus = async () => {
      let next: BackendStatus = { source: 'mock', data_mode: null, replay_dates: null, demo_date: null };
      try {
        const res = await fetch('/api/v1/status');
        if (res.ok) next = await res.json();
      } catch (err) {
        console.error('Error fetching backend status:', err);
      }
      if (!isMounted) return;
      if (next.data_mode === 'replay' && next.replay_dates) {
        const { min, max } = next.replay_dates;
        const wanted = next.demo_date ?? max;
        setArchiveDate(wanted < min ? min : wanted > max ? max : wanted);
      }
      setStatus(next);
    };
    loadStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch heatmap data when the time horizon or archive day changes (after the status is known)
  useEffect(() => {
    if (!status) return;
    let isMounted = true;
    const loadHeatmap = async () => {
      try {
        const params = new URLSearchParams({ time: timeHorizon });
        if (archiveDate) params.set('date', archiveDate);
        const res = await fetch(`/api/v1/heatmap?${params.toString()}`);
        if (!isMounted) return;
        if (res.status === 503) {
          // Backend is up but has no data for this day: say so, and clear the map instead of showing stale areas.
          const body = await res.json().catch(() => null);
          if (!isMounted) return;
          setDataSource('unavailable');
          setUnavailableMessage(body?.message ?? 'Data tidak tersedia');
          setFeatures([]);
          setAnalysis(null);
          return;
        }
        if (!res.ok) return;
        const json: HeatmapGeoJSONResponse = await res.json();
        const loaded = json.features;
        setDataSource(res.headers.get('x-pawang-source') === 'backend' ? 'backend' : 'mock');
        setTargetDate(json.metadata?.target_date ?? null);
        setFeatures(loaded);
        // Select the area with the highest flood probability when nothing valid is selected yet
        // (first load, or an ID that this data source does not have).
        setSelectedGridId((prev) => {
          if (loaded.length === 0) return prev;
          if (prev && loaded.some((f) => f.properties.grid_id === prev)) return prev;
          return loaded.reduce((a, b) =>
            (b.properties.flood_probability ?? -1) > (a.properties.flood_probability ?? -1) ? b : a
          ).properties.grid_id;
        });
      } catch (err) {
        console.error('Error fetching heatmap:', err);
      }
    };
    loadHeatmap();
    return () => {
      isMounted = false;
    };
  }, [timeHorizon, archiveDate, status]);

  // Fetch analysis data when the selected area, time horizon or archive day changes
  useEffect(() => {
    if (!selectedGridId) return;
    let isMounted = true;
    const loadAnalysis = async () => {
      try {
        const params = new URLSearchParams({ grid_id: selectedGridId, time: timeHorizon });
        if (archiveDate) params.set('date', archiveDate);
        const res = await fetch(`/api/v1/analysis?${params.toString()}`);
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
  }, [selectedGridId, timeHorizon, archiveDate]);

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

  const handleSelectGrid = (gridId: string, position?: [number, number]) => {
    setSelectedGridId(gridId);
    if (position) {
      setMarkerPosition(position);
      return;
    }

    const selectedFeature = features.find((feature) => feature.properties.grid_id === gridId);
    if (selectedFeature?.geometry.coordinates[0]) {
      const coordinates = selectedFeature.geometry.coordinates[0];
      const latitudes = coordinates.map((coordinate) => coordinate[1]);
      const longitudes = coordinates.map((coordinate) => coordinate[0]);
      setMarkerPosition([
        (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
        (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      ]);
    }
  };

  const highRiskCount = features.filter(
    (f) => f.properties.risk_level === 'High' || f.properties.risk_level === 'Extreme'
  ).length;

  const probabilities = features
    .map((f) => f.properties.flood_probability)
    .filter((p): p is number => Number.isFinite(p));
  const minProbability = probabilities.length ? Math.min(...probabilities) : null;
  const maxProbability = probabilities.length ? Math.max(...probabilities) : null;

  // Demo layers (water gates, shelters, radar rings) have no real data source: hide them next to real data.
  const mapLayers = hasRealData
    ? { ...layers, waterGates: false, evacuation: false, radarPulse: false }
    : layers;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* 1. Fullscreen Base Leaflet Map */}
      <div className="absolute inset-0 z-0">
        <LeafletMap
          features={features}
          markerPosition={markerPosition}
          basemap={basemap}
          layers={mapLayers}
          waterGates={hasRealData ? [] : WATER_GATE_STATIONS}
          evacuationCenters={hasRealData ? [] : EVACUATION_CENTERS}
          onSelectGrid={handleSelectGrid}
        />
      </div>

      {/* 2. Top status, centered independently from the map controls */}
      <header className="absolute top-4 left-1/2 z-30 -translate-x-1/2">
        <TopStatusPill highRiskCount={highRiskCount} />
      </header>
      <div className="absolute top-16 left-1/2 z-30 -translate-x-1/2">
        <DataSourceBanner
          source={dataSource}
          status={status}
          targetDate={targetDate}
          archiveDate={archiveDate}
          message={unavailableMessage}
          onChangeArchiveDate={setArchiveDate}
        />
      </div>

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
          hasRealData={hasRealData}
        />
      </div>

      {/* 4. Minimal heatmap legend above the source attribution */}
      <div className="absolute bottom-14 left-3 z-30">
        <HeatmapLegend minProbability={minProbability} maxProbability={maxProbability} />
      </div>

      <Attribution />

      {/* 5. Right Sidebar (Floating / Slide-out Panel) */}
      <RightSidebar
        analysis={analysis}
        features={features}
        isLoading={false}
        timeHorizon={timeHorizon}
        onChangeTimeHorizon={(h) => setTimeHorizon(h)}
        isSimulating={isSimulating}
        onToggleSimulation={() => setIsSimulating(!isSimulating)}
        onSelectRegionById={handleSelectGrid}
        onOpenSearchModal={() => setIsSearchOpen(true)}
      />

      {/* 6. Spotlight Search Modal (⌘F / Ctrl+K) */}
      <SearchModal
        features={features}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectRegion={handleSelectGrid}
      />
    </main>
  );
};
