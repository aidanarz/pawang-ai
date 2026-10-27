'use client';

import React, { useState } from 'react';
import {
  Search,
  AlertTriangle,
  ShieldCheck,
  Droplets,
  Clock,
  Compass,
  Car,
  Wind,
  ChevronRight,
  ChevronLeft,
  Navigation,
  Play,
  Pause,
  MapPin,
  PhoneCall,
} from 'lucide-react';
import { AreaAnalysisResponse, TimeHorizon } from '@/data/types';
import { getRiskBadgeClasses, getSiagaBadgeClasses, getColorForRainfall } from '@/utils/colorScale';
import { HydrographChart } from './HydrographChart';
import { BASE_FLOOD_ZONES } from '@/data/floodData';

interface RightSidebarProps {
  analysis: AreaAnalysisResponse | null;
  isLoading: boolean;
  timeHorizon: TimeHorizon;
  onChangeTimeHorizon: (horizon: TimeHorizon) => void;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  onSelectRegionById: (gridId: string) => void;
  onOpenSearchModal: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  analysis,
  isLoading,
  timeHorizon,
  onChangeTimeHorizon,
  isSimulating,
  onToggleSimulation,
  onSelectRegionById,
  onOpenSearchModal,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Filter locations for search bar dropdown
  const filteredLocations = BASE_FLOOD_ZONES.filter((zone) =>
    zone.properties.area_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    zone.properties.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
    zone.properties.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `kecamatan ${zone.properties.district}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    zone.properties.grid_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const riskClasses = analysis
    ? getRiskBadgeClasses(analysis.risk_level)
    : getRiskBadgeClasses('Medium');

  const siagaClasses = analysis
    ? getSiagaBadgeClasses(analysis.siaga_level)
    : getSiagaBadgeClasses('Normal');
  const emergencyContacts = [
    { label: 'BPBD', number: '112' },
    { label: 'BNPB', number: '117' },
    { label: 'SAR', number: '115' },
    { label: 'Polisi', number: '110' },
    { label: 'Damkar', number: '113' },
    { label: 'Ambulans', number: '118' },
  ];
  const isNoRisk = Boolean(
    analysis && analysis.risk_level === 'Low' && analysis.rainfall_mm === 0
  );

  return (
    <>
      {/* Google Maps-style attached collapse toggle */}
      <button
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        className="fixed top-1/2 z-50 flex h-14 w-7 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-gray-200 bg-white text-blue-600 transition-[right] duration-300 hover:bg-gray-50 dark:border-gray-700/50 dark:bg-[#1E1E2D] dark:text-blue-400 dark:hover:bg-slate-800"
        style={{ right: isCollapsed ? 0 : 'min(410px, 100vw)' }}
        title={isCollapsed ? 'Buka Panel Analisa' : 'Sembunyikan Panel Analisa'}
        aria-label={isCollapsed ? 'Buka Panel Analisa' : 'Sembunyikan Panel Analisa'}
      >
        {isCollapsed ? (
          <ChevronLeft size={16} className="text-black dark:text-slate-100" />
        ) : (
          <ChevronRight size={16} className="text-black dark:text-slate-100" />
        )}
      </button>

      {/* Full-height right panel */}
      <aside
        className={`sidebar-surface fixed inset-y-0 right-0 z-40 flex h-screen w-full flex-col overflow-hidden border-l border-gray-200 bg-white transition-transform duration-300 ease-in-out dark:border-gray-700/50 dark:bg-[#1E1E2D] sm:w-[410px] ${
          isCollapsed ? 'translate-x-full pointer-events-none' : 'translate-x-0'
        }`}
      >
        {/* Panel Header & Search Bar */}
        <div className="border-b border-gray-200 bg-white p-3.5 pb-2.5 dark:border-gray-700/50 dark:bg-[#1E1E2D]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center">
              <span className="text-sm font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                Periksa Daerah
              </span>
            </div>

          </div>

          {/* Search Bar with Shortcut Indicator */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 text-blue-600 dark:text-blue-400"
              />
              <input
                type="text"
                placeholder="ketik daerah atau klik dua kali pada peta"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-16 text-xs leading-relaxed text-gray-900 transition-all placeholder:text-gray-500 placeholder:italic focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-gray-700/50 dark:bg-[#1E1E2D] dark:text-gray-100 dark:placeholder:text-gray-400"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <kbd
                  onClick={onOpenSearchModal}
                  className="cursor-pointer rounded border border-gray-200 bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 dark:border-gray-700/50 dark:bg-[#1E1E2D] dark:text-gray-400"
                >
                  ⌘F
                </kbd>
              </div>
            </div>

            {/* Live Search Suggestions Dropdown */}
            {isSearchFocused && searchQuery && (
              <div className="absolute left-0 right-0 top-full mt-1.5 glass-panel rounded-xl shadow-2xl p-1 z-50 max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-700 text-xs">
                {filteredLocations.length > 0 ? (
                  filteredLocations.map((item) => (
                    <button
                      key={item.properties.grid_id}
                      onClick={() => {
                        onSelectRegionById(item.properties.grid_id);
                        setSearchQuery('');
                        setIsSearchFocused(false);
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-between text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-blue-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-xs leading-tight">
                            {item.properties.area_name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {item.properties.district}, {item.properties.city}
                          </div>
                        </div>
                      </div>
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: getColorForRainfall(item.properties.rainfall_mm),
                        }}
                      />
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-center text-slate-400 text-xs">
                    Daerah tidak ditemukan
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Time Horizon Forecast Selector */}
          <div className="mt-2.5 pt-2 border-t border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Prakiraan:
              </span>
              <div className="flex items-center bg-white dark:bg-slate-800/70 p-0.5 rounded-lg">
                {(['1h', '3h', '5h', '12h', '24h'] as TimeHorizon[]).map((horizon) => (
                  <button
                    key={horizon}
                    onClick={() => onChangeTimeHorizon(horizon)}
                    className={`px-2 py-0.5 text-[10.5px] font-semibold rounded-md transition-all ${
                      timeHorizon === horizon
                        ? 'bg-gray-100 text-gray-900 dark:bg-blue-600 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {horizon}
                  </button>
                ))}
              </div>
            </div>

            {/* Play/Pause Simulation button */}
            <button
              onClick={onToggleSimulation}
              className={`p-1.5 rounded-lg flex items-center gap-1 text-[10.5px] font-medium transition-colors ${
                isSimulating
                  ? 'bg-gray-100 text-gray-900 dark:bg-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/70'
              }`}
              title={isSimulating ? 'Jeda Simulasi' : 'Jalankan Simulasi Waktu'}
            >
              {isSimulating ? (
                <Pause size={13} className="text-blue-600 dark:text-blue-400" />
              ) : (
                <Play size={13} className="text-blue-600 dark:text-blue-400" />
              )}
              <span className="hidden xs:inline">{isSimulating ? 'Stop' : 'Play'}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
              <p className="text-xs text-slate-400 font-medium">
                Mengambil data hidrologi satelit & sensor...
              </p>
            </div>
          ) : analysis ? (
            <>
              {/* Selected Area Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">
                    <Navigation size={11} className="shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>{analysis.city} • {analysis.district}</span>
                  </div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
                    {analysis.area_name}
                  </h2>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`text-[11px] font-bold ${riskClasses.text}`}
                  >
                    {riskClasses.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {analysis.grid_id}
                  </span>
                </div>
              </div>

              {/* SECTION 1: Overview Analisa Card */}
              <div className="min-h-[270px] space-y-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700/50">
                <div className="flex w-full items-start text-left">
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                      <AlertTriangle size={14} className="text-blue-600 dark:text-blue-400" />
                      Overview Analisa AI
                    </span>
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      High Data Confidence
                    </span>
                  </span>
                </div>

                {/* High-level AI Summary Text */}
                <p className="min-h-[72px] text-justify text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium p-2.5 border-y border-gray-200 dark:border-gray-700/50">
                  {isNoRisk
                    ? 'Kondisi wilayah terpantau aman. Tidak terdapat probabilitas presipitasi maupun indikasi genangan air pada area ini untuk rentang waktu perkiraan.'
                    : analysis.risk_level === 'Extreme'
                    ? `PERINGATAN KRITIS: Adanya kemungkinan banjir parah pada daerah ini pada ${timeHorizon} berikutnya akibat limpasan air kiriman dan intensitas hujan tinggi.`
                    : analysis.risk_level === 'High'
                    ? `Adanya kemungkinan banjir sedang hingga tinggi pada daerah ini pada ${timeHorizon} berikutnya dengan estimasi genangan ${analysis.inundation_range}.`
                    : analysis.risk_level === 'Medium'
                    ? `Adanya potensi genangan air sedang pada cekungan jalan dan saluran drainase dalam rentang ${timeHorizon} ke depan.`
                    : `Kondisi daerah terpantau aman dan stabil dalam rentang ${timeHorizon} ke depan dengan risiko banjir minimal.`}
                </p>

                {/* Hydrologic Metrics Grid */}
                <div className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Informasi Lanjut
                </div>
                <div className="grid grid-cols-2 gap-0 text-xs border-y border-gray-200 dark:border-gray-700/50">
                  {/* Metric: Rainfall */}
                  <div className="p-2.5 border-r border-b border-gray-200 dark:border-gray-700/50">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[10px]">
                      <Droplets size={12} className="text-blue-600 dark:text-blue-400" />
                      <span>Curah Hujan</span>
                    </div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1 flex items-baseline gap-1">
                      <span>{isNoRisk ? 0 : analysis.rainfall_mm}</span>
                      <span className="text-[10px] font-normal text-slate-400">mm/jam</span>
                    </div>
                    <div
                      className="text-[9.5px] font-semibold mt-0.5"
                      style={{ color: getColorForRainfall(analysis.rainfall_mm) }}
                    >
                      {analysis.rainfall_mm > 25
                        ? 'Sangat Lebat'
                        : analysis.rainfall_mm > 15
                        ? 'Hujan Lebat'
                        : analysis.rainfall_mm > 5
                        ? 'Hujan Sedang'
                        : isNoRisk
                        ? 'Normal'
                        : 'Hujan Ringan'}
                    </div>
                  </div>

                  {/* Metric: Water Level (TMA) */}
                  <div className="p-2.5 border-b border-gray-200 dark:border-gray-700/50">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[10px]">
                      <Clock size={12} className="text-blue-600 dark:text-blue-400" />
                      <span>Status Muka Air</span>
                    </div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1 flex items-baseline gap-1">
                      <span>{analysis.water_level_cm}</span>
                      <span className="text-[10px] font-normal text-slate-400">cm</span>
                    </div>
                    <span
                      className={`text-[9.5px] font-bold ${siagaClasses.text}`}
                    >
                      {isNoRisk ? 'Aman' : analysis.siaga_level}
                    </span>
                  </div>

                  {/* Metric: Peak Time */}
                  <div className="p-2.5 border-r border-gray-200 dark:border-gray-700/50">
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">
                      Estimasi Puncak
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1">
                      {analysis.peak_time}
                    </div>
                    <div className="text-[9.5px] text-slate-400 mt-0.5">
                      Model Horizon {timeHorizon}
                    </div>
                  </div>

                  {/* Metric: Inundation Range */}
                  <div className="p-2.5">
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">
                      Tinggi Genangan
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 text-rose-600 dark:text-rose-400">
                      {isNoRisk ? '0 cm' : analysis.inundation_range}
                    </div>
                    <div className="text-[9.5px] text-slate-400 mt-0.5">
                      Kedalaman Rata-rata
                    </div>
                  </div>
                </div>

                {/* Hydrograph Curve Chart */}
                <div className="border-b border-gray-200 pb-3 dark:border-gray-700/50">
                  <HydrographChart
                    data={analysis.hydrograph}
                  />
                </div>
              </div>

              {/* SECTION 2: Recommendations / Early Warning Card */}
              <div className="glass-panel rounded-xl p-3 bg-slate-900/5 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-blue-600 dark:text-blue-400" />
                    Rekomendasi & Peringatan Dini
                  </span>
                  <span className="text-[10px] text-slate-400">Panduan Komuter</span>
                </div>

                {/* Commuter Action Advice */}
                <div className="p-2.5 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/30 flex items-start gap-2.5">
                  <Car size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-bold text-gray-900 dark:text-gray-100 mb-0.5">
                      Peringatan Pengendara:
                    </div>
                    <div className="text-gray-800 dark:text-gray-200 leading-relaxed font-medium">
                      {analysis.recommendation}
                    </div>
                  </div>
                </div>

                {/* Evacuation Route Advice */}
                <div className="p-2.5 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/30 flex items-start gap-2.5">
                  <Compass size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-bold text-blue-800 dark:text-blue-200 mb-0.5">
                      Jalur Alternatif / Evakuasi Bebas Banjir:
                    </div>
                    <div className="text-blue-900/90 dark:text-blue-200/90 leading-relaxed">
                      {analysis.evacuation_route}
                    </div>
                  </div>
                </div>

                {/* Affected Roads Tag List */}
                {analysis.affected_roads && analysis.affected_roads.length > 0 && (
                  <div>
                    <div className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                      <Wind size={11} className="text-blue-600 dark:text-blue-400" />
                      Ruas Jalan Terdampak Genangan:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.affected_roads.map((road, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-slate-200/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 flex items-center gap-1"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          {road}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-2 dark:border-gray-700/50">
                  <div className="mb-1.5 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                    Nomor Darurat
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {emergencyContacts.map((contact) => (
                      <a
                        key={contact.label}
                        href={`tel:${contact.number}`}
                        className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-1.5 text-[10.5px] text-slate-700 dark:border-gray-700/50 dark:text-slate-200"
                      >
                        <span className="flex items-center gap-1">
                          <PhoneCall size={10} className="text-blue-600 dark:text-blue-400" />
                          {contact.label}
                        </span>
                        <span className="font-mono font-semibold">{contact.number}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs">
              Pilih wilayah pada peta untuk melihat detail analisa.
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-3 py-2 text-center text-[9.5px] leading-relaxed text-slate-400 dark:border-slate-800/70">
          Prediksi menggunakan learning model dengan guardrails dan dievaluasi oleh agentic AI, data belum tentu 100% akurat
        </div>
      </aside>
    </>
  );
};
