'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Flag } from 'lucide-react';
import {
  TimeHorizon,
  BasemapType,
  GeoJSONGridFeature,
  AreaAnalysisResponse,
  BackendStatus,
  DataSource,
  HeatmapGeoJSONResponse,
  PredictionMode,
} from '@/data/types';
import { WATER_GATE_STATIONS, EVACUATION_CENTERS } from '@/data/floodData';
import { DataSourceBanner } from './DataSourceBanner';
import { RightSidebar } from './RightSidebar';
import { HeatmapLegend } from './HeatmapLegend';
import { ReportModal, type ReportDraft } from './ReportModal';
import { featureCenter, type LiveReport } from '@/data/reportConditions';
import type { WarningsResponse } from '@/data/agent';
import { WarningBanner } from './WarningBanner';
import type { RouteResponse } from '@/data/types';
import { dominantTier } from '@/utils/areaColors';
import { MapControls } from './MapControls';
import { SearchModal } from './SearchModal';
import { Attribution } from './Attribution';
import { predictionModeParams } from '@/utils/predictionMode';

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

export const MapDashboard: React.FC<{ initialGridId?: string }> = ({ initialGridId }) => {
  // App States
  const [selectedGridId, setSelectedGridId] = useState<string | null>(initialGridId ?? null);
  const focusedInitial = useRef(false);
  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>('5h');
  const [predictionMode, setPredictionMode] = useState<PredictionMode>('live');
  const [features, setFeatures] = useState<GeoJSONGridFeature[]>([]);
  const [analysis, setAnalysis] = useState<AreaAnalysisResponse | null>(null);
  // True while /api/v1/analysis is in flight. The advice is written by Qwen, which can take seconds.
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [basemap, setBasemap] = useState<BasemapType>(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      return localStorage.getItem('pawang-theme') === 'light' ? 'osm' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      return localStorage.getItem('pawang-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [reports, setReports] = useState<LiveReport[]>([]);
  const [warningsData, setWarningsData] = useState<WarningsResponse | null>(null);
  // Alternative route. The answer is tied to the day/mode it was computed for, so changes hide it.
  const [routeRes, setRouteRes] = useState<{ data: RouteResponse; key: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeDest, setRouteDest] = useState<{ label: string; gridId?: string; position: [number, number] } | null>(null);
  const [isRoutePicking, setIsRoutePicking] = useState(false);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [isReportPicking, setIsReportPicking] = useState(false);
  const [reportPickingDraft, setReportPickingDraft] = useState<ReportDraft | null>(null);

  // Data source: 'loading' until the first heatmap answer, then 'backend' (model) or 'mock' (demo data).
  const [dataSource, setDataSource] = useState<DataSource>('loading');
  const [predictionLoading, setPredictionLoading] = useState(true);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  // Keep the selected archive day when switching back to Live.
  const [archiveDate, setArchiveDate] = useState<string | null>(null);

  const [layers] = useState({
    heatmap: true,
    waterGates: true,
    evacuation: true,
    radarPulse: true,
  });

  const hasRealData = dataSource === 'backend';

  // Synchronize initial theme preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pawang-theme') as 'dark' | 'light' | null;
      const initial = saved === 'light' ? 'light' : 'dark';
      if (initial === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('pawang-theme', next);
      } catch {}

      if (next === 'dark') {
        document.documentElement.classList.add('dark');
        setBasemap('dark');
      } else {
        document.documentElement.classList.remove('dark');
        setBasemap('osm');
      }
      return next;
    });
  };

  // Ask once whether the backend is up and which archived days it can serve.
  useEffect(() => {
    let isMounted = true;
    const loadStatus = async () => {
      let next: BackendStatus = {
        source: 'mock', data_mode: null, available_modes: [], replay_dates: null, demo_date: null,
      };
      try {
        const res = await fetch('/api/v1/status');
        if (res.ok) next = await res.json();
      } catch (err) {
        console.error('Error fetching backend status:', err);
      }
      if (!isMounted) return;
      if (next.available_modes.includes('replay') && next.replay_dates) {
        setArchiveDate(next.replay_dates.max);
      }
      setStatus(next);
    };
    loadStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch heatmap data when the time horizon, mode or archive day changes (after the status is known)
  useEffect(() => {
    if (!status) return;
    let isMounted = true;
    const loadHeatmap = async () => {
      try {
        const params = new URLSearchParams({
          time: timeHorizon,
          ...predictionModeParams(predictionMode, archiveDate),
        });
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
        if (!res.ok) {
          // Do not keep drawing the previous response as if it were current.
          setDataSource('unavailable');
          setUnavailableMessage('Server error, coba lagi sebentar lagi.');
          setFeatures([]);
          setAnalysis(null);
          return;
        }
        const json: HeatmapGeoJSONResponse = await res.json();
        const loaded = json.features;
        setDataSource(res.headers.get('x-pawang-source') === 'backend' ? 'backend' : 'mock');
        setTargetDate(json.metadata?.target_date ?? null);
        setFeatures(loaded);
        // Opened from the landing page with ?area=: centre the map on that kecamatan, once.
        const wanted = initialGridId ? loaded.find((f) => f.properties.grid_id === initialGridId) : undefined;
        if (wanted && !focusedInitial.current) {
          focusedInitial.current = true;
          const [lat, lng] = featureCenter(wanted);
          setMarkerPosition([lat, lng]);
          window.dispatchEvent(new CustomEvent('pawang:flyto', { detail: { lat, lng, zoom: 13 } }));
        }
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
      } finally {
        if (isMounted) setPredictionLoading(false);
      }
    };
    loadHeatmap();
    return () => {
      isMounted = false;
    };
  }, [timeHorizon, predictionMode, archiveDate, status, initialGridId]);

  // Fetch analysis data when the selected area, time horizon, mode or archive day changes
  useEffect(() => {
    if (!selectedGridId) return;
    let isMounted = true;
    const loadAnalysis = async () => {
      setAnalysisLoading(true);
      try {
        const params = new URLSearchParams({
          grid_id: selectedGridId,
          time: timeHorizon,
          ...predictionModeParams(predictionMode, archiveDate),
        });
        const res = await fetch(`/api/v1/analysis?${params.toString()}`);
        if (!isMounted) return;
        // On failure clear it: the sidebar must not show the previous area's risk under this area's name.
        setAnalysis(res.ok ? ((await res.json()) as AreaAnalysisResponse) : null);
      } catch (err) {
        console.error('Error fetching analysis:', err);
      } finally {
        if (isMounted) setAnalysisLoading(false);
      }
    };
    loadAnalysis();
    return () => {
      isMounted = false;
    };
  }, [selectedGridId, timeHorizon, predictionMode, archiveDate]);

  // Live crowd reports: load now and refresh every minute (reports expire on the backend).
  const loadReports = React.useCallback(async () => {
    try {
      const res = await fetch('/api/v1/reports');
      if (res.ok) setReports(((await res.json()) as { reports: LiveReport[] }).reports ?? []);
    } catch (err) {
      console.error('Error fetching reports:', err);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReports();
    const timer = setInterval(loadReports, 60_000);
    return () => clearInterval(timer);
  }, [loadReports]);

  // Early warnings from the Flood Watch Agent: load now and refresh every minute.
  useEffect(() => {
    let alive = true;
    const loadWarnings = async () => {
      try {
        const res = await fetch('/api/v1/warnings');
        if (res.ok && alive) setWarningsData((await res.json()) as WarningsResponse);
      } catch (err) {
        console.error('Error fetching warnings:', err);
      }
    };
    loadWarnings();
    const timer = setInterval(loadWarnings, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Forecast Timeline Simulation Loop
  useEffect(() => {
    if (!isSimulating) return;

    const horizons: TimeHorizon[] = ['1h', '3h', '5h', '12h', '24h'];
    const interval = setInterval(() => {
      setPredictionLoading(true);
      setTimeHorizon((prev) => {
        const idx = horizons.indexOf(prev);
        const nextIdx = (idx + 1) % horizons.length;
        return horizons[nextIdx];
      });
    }, 2800);

    return () => clearInterval(interval);
  }, [isSimulating]);

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

  const routeKey = `${predictionMode}|${timeHorizon}|${archiveDate ?? ''}`;
  const route = routeRes && routeRes.key === routeKey ? routeRes.data : null;
  const originFeature = features.find((f) => f.properties.grid_id === selectedGridId);
  const originPosition: [number, number] | null =
    markerPosition ?? (originFeature ? featureCenter(originFeature) : null);

  const runRoute = async () => {
    if (!originPosition || !routeDest) return;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const res = await fetch('/api/v1/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: originPosition[0], lon: originPosition[1] },
          destination: { lat: routeDest.position[0], lon: routeDest.position[1] },
          time: timeHorizon,
          ...predictionModeParams(predictionMode, archiveDate),
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.recommended) {
        setRouteRes({ data: body as RouteResponse, key: routeKey });
      } else {
        setRouteRes(null);
        const msg = typeof body?.detail === 'string' ? body.detail : body?.message;
        setRouteError(typeof msg === 'string' ? msg : 'Rute tidak bisa dihitung.');
      }
    } catch {
      setRouteRes(null);
      setRouteError('Rute tidak bisa dihitung.');
    } finally {
      setRouteLoading(false);
    }
  };

  const handlePredictionModeChange = (mode: PredictionMode) => {
    if (mode === predictionMode) return;
    setPredictionMode(mode);
    setPredictionLoading(true);
    setTargetDate(null);
    setUnavailableMessage(null);
    setFeatures([]);
    setAnalysis(null);
    setRouteRes(null);
  };

  const handleArchiveDateChange = (date: string | null) => {
    setArchiveDate(date);
    setPredictionLoading(true);
    setTargetDate(null);
    setUnavailableMessage(null);
    setFeatures([]);
    setAnalysis(null);
    setRouteRes(null);
  };

  const handleTimeHorizonChange = (horizon: TimeHorizon) => {
    if (horizon === timeHorizon) return;
    setPredictionLoading(true);
    setTimeHorizon(horizon);
    setRouteRes(null);
  };

  const highRiskCount = features.filter(
    (f) => f.properties.risk_level === 'High' || f.properties.risk_level === 'Extreme'
  ).length;

  // Demo layers (water gates, shelters, radar rings) have no real data source: hide them next to real data.
  const mapLayers = hasRealData
    ? { ...layers, waterGates: false, evacuation: false, radarPulse: false }
    : layers;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#FFF9D2] dark:bg-[#010736] transition-colors duration-300">
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
          reports={reports}
          isReportPicking={isReportPicking}
          route={route}
          isRoutePicking={isRoutePicking}
          onPickRouteDestination={(position) => {
            setIsRoutePicking(false);
            setRouteDest({ label: `Titik di peta (${position[0].toFixed(4)}, ${position[1].toFixed(4)})`, position });
          }}
          onPickReportLocation={(gridId, position) => {
            setIsReportPicking(false);
            setReportPickingDraft(null);
            setReportDraft({ gridId, position });
            setMarkerPosition(position);
          }}
        />
      </div>

      {/* 2. Prediction controls and live status share one pill */}
      <header className="absolute top-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start justify-center">
        <DataSourceBanner
          source={dataSource}
          status={status}
          mode={predictionMode}
          targetDate={targetDate}
          archiveDate={archiveDate}
          message={unavailableMessage}
          onChangeMode={handlePredictionModeChange}
          onChangeArchiveDate={handleArchiveDateChange}
          highRiskCount={highRiskCount}
          backendConnected={status ? status.source === 'backend' : null}
          predictionLoading={predictionLoading}
        />
      </header>

      {/* Report button: the other way in besides a double click on the map */}
      <button
        type="button"
        disabled={features.length === 0}
        onClick={() => {
          const gridId = selectedGridId ?? features[0]?.properties.grid_id;
          if (gridId) setReportDraft({ gridId });
        }}
        className="absolute left-4 top-4 z-30 flex items-center gap-1.5 rounded-full border border-[#22396F]/30 bg-[#FFF9D2]/95 px-3.5 py-2 text-xs font-bold text-[#010736] shadow-md backdrop-blur-md transition hover:brightness-105 disabled:opacity-50 dark:border-[#22396F]/80 dark:bg-[#0D1C42]/95 dark:text-[#FCF1D0]"
        title="Laporkan kondisi jalan atau banjir saat ini"
      >
        <Flag size={13} className="text-[#1A73E8] dark:text-[#8AB4F8]" />
        Lapor kondisi
      </button>

      <WarningBanner
        warnings={warningsData?.active ?? []}
        lastCheckedAt={warningsData?.last_cycle?.at ?? null}
        onSelect={(gridId) => {
          handleSelectGrid(gridId);
          const f = features.find((x) => x.properties.grid_id === gridId);
          if (f) {
            const [lat, lng] = featureCenter(f);
            window.dispatchEvent(new CustomEvent('pawang:flyto', { detail: { lat, lng, zoom: 13 } }));
          }
        }}
      />

      {isRoutePicking && (
        <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-[#DADCE0] bg-white/95 px-3 py-2 text-xs text-[#202124] shadow-lg backdrop-blur-md dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#E8EAED]">
          <span>Klik titik tujuan pada peta</span>
          <button type="button" onClick={() => setIsRoutePicking(false)} className="rounded-md border border-current px-2 py-1 font-bold">
            Batal
          </button>
        </div>
      )}

      {isReportPicking && (
        <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-[#22396F] bg-[#FFEBCC]/95 px-3 py-2 text-xs text-[#010736] shadow-lg backdrop-blur-md dark:bg-[#0D1C42]/95 dark:text-[#FCF1D0]">
          <span>Klik titik pada peta untuk memilih lokasi laporan</span>
          <button
            type="button"
            onClick={() => {
              setIsReportPicking(false);
              if (reportPickingDraft) setReportDraft(reportPickingDraft);
              setReportPickingDraft(null);
            }}
            className="rounded-md border border-current px-2 py-1 font-bold"
          >
            Batal
          </button>
        </div>
      )}

      {/* 3. Center-left map controls */}
      <div className="absolute left-4 top-1/2 z-30 -translate-y-1/2">
        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          basemap={basemap}
          onChangeBasemap={(b) => setBasemap(b)}
        />
      </div>

      {/* 4. Minimal heatmap legend above the source attribution */}
      <div className="absolute bottom-14 left-3 z-30">
        <HeatmapLegend dominant={dominantTier(features)} />
      </div>

      <Attribution />

      {/* 5. Right Sidebar (Floating / Slide-out Panel) */}
      <RightSidebar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        analysis={analysis}
        features={features}
        // Loading view only when a NEW area is picked: a horizon change keeps the current panel until the
        // answer arrives, so the timeline simulation does not flash a spinner every step.
        isLoading={analysisLoading && analysis?.grid_id !== selectedGridId}
        selectedAreaName={
          features.find((f) => f.properties.grid_id === selectedGridId)?.properties.area_name ?? null
        }
        timeHorizon={timeHorizon}
        onChangeTimeHorizon={handleTimeHorizonChange}
        isSimulating={isSimulating}
        onToggleSimulation={() => setIsSimulating(!isSimulating)}
        onSelectRegionById={handleSelectGrid}
        onOpenSearchModal={() => setIsSearchOpen(true)}
        areaWarning={warningsData?.active.find((w) => w.grid_id === selectedGridId) ?? null}
        planner={{
          originName: originFeature?.properties.area_name ?? null,
          features,
          destination: routeDest ? { label: routeDest.label, gridId: routeDest.gridId } : null,
          route,
          loading: routeLoading,
          error: routeError,
          picking: isRoutePicking,
          onChooseArea: (gridId) => {
            const f = features.find((x) => x.properties.grid_id === gridId);
            if (f) setRouteDest({ label: f.properties.area_name, gridId, position: featureCenter(f) });
            setIsRoutePicking(false);
          },
          onPickOnMap: () => setIsRoutePicking(true),
          onRun: runRoute,
          onClear: () => {
            setRouteRes(null);
            setRouteError(null);
          },
        }}
      />

      {reportDraft && (
        <ReportModal
          draft={reportDraft}
          features={features}
          onClose={() => setReportDraft(null)}
          onSent={(report) => {
            // Show it at once, like Waze; the next refresh brings the server's copy.
            setReports((prev) => [...prev.filter((r) => r.id !== report.id), report]);
            setMarkerPosition([report.lat, report.lon]);
            setReportDraft(null);
            loadReports();
          }}
          onPickOnMap={(draft) => {
            setReportDraft(null);
            setReportPickingDraft(draft);
            setIsReportPicking(true);
          }}
        />
      )}

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