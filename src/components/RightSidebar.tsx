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
  Sun,
  Moon,
  ChevronRight,
  ChevronLeft,
  Navigation,
  Play,
  Pause,
  MapPin,
  PhoneCall,
  CheckCircle2,
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
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
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
  theme,
  onToggleTheme,
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
  const isNoRisk = Boolean(
    analysis && analysis.risk_level === 'Low' && analysis.rainfall_mm === 0
  );

  return (
    <>
      {/* Floating Toggle Button when Collapsed */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="fixed right-4 top-20 z-40 glass-panel px-3.5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-500 transition-all border border-slate-200/80 dark:border-slate-800"
          title="Buka Panel Analisa"
        >
          <ChevronLeft size={16} />
          <span>Panel Analisa AI</span>
          {analysis && (
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: getColorForRainfall(analysis.rainfall_mm) }}
            />
          )}
        </button>
      )}

      {/* Main Slide-out Panel */}
      <aside
        className={`fixed top-4 right-4 bottom-4 z-40 w-full sm:w-[410px] max-w-[calc(100vw-32px)] glass-panel rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 border border-slate-200/70 dark:border-slate-800/80 backdrop-blur-xl ${
          isCollapsed ? 'translate-x-[440px] pointer-events-none opacity-0' : 'translate-x-0 opacity-100'
        }`}
      >
        {/* Panel Header & Search Bar */}
        <div className="p-3.5 pb-2.5 border-b border-slate-200/60 dark:border-slate-800/70 bg-slate-900/5 dark:bg-slate-900/30">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-radar-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Pusat Analisis Hidrologi
              </span>
            </div>

            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-500/10 rounded-lg transition-colors"
              title="Sembunyikan Panel"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Search Bar with Shortcut Indicator */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search
                size={15}
                className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Periksa daerah (cth: Kemang, Rawajati, Manggarai...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                className="w-full pl-9 pr-16 py-2 rounded-xl text-xs bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <kbd
                  onClick={onOpenSearchModal}
                  className="cursor-pointer text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-xs"
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
              <div className="flex items-center bg-slate-200/60 dark:bg-slate-800/70 p-0.5 rounded-lg">
                {(['1h', '3h', '5h', '12h', '24h'] as TimeHorizon[]).map((horizon) => (
                  <button
                    key={horizon}
                    onClick={() => onChangeTimeHorizon(horizon)}
                    className={`px-2 py-0.5 text-[10.5px] font-semibold rounded-md transition-all ${
                      timeHorizon === horizon
                        ? 'bg-blue-600 text-white shadow-xs'
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
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-500/10'
              }`}
              title={isSimulating ? 'Jeda Simulasi' : 'Jalankan Simulasi Waktu'}
            >
              {isSimulating ? <Pause size={13} /> : <Play size={13} />}
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
                    <Navigation size={11} className="shrink-0" />
                    <span>{analysis.city} • {analysis.district}</span>
                  </div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
                    {analysis.area_name}
                  </h2>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${riskClasses.bg} ${riskClasses.text} ${riskClasses.border}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${riskClasses.dot} animate-ping-slow`} />
                    {riskClasses.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {analysis.grid_id}
                  </span>
                </div>
              </div>

              {/* SECTION 1: Overview Analisa Card */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Overview Analisa AI
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    {analysis.confidence_badge}
                  </span>
                </div>

                {/* High-level AI Summary Text */}
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium p-2.5 border-y border-gray-200 dark:border-gray-700/50">
                  {isNoRisk
                    ? 'Kondisi wilayah terpantau aman. Tidak terdapat probabilitas presipitasi maupun indikasi genangan air pada area ini untuk rentang waktu perkiraan.'
                    : analysis.risk_level === 'Extreme'
                    ? `⚠️ PERINGATAN KRITIS: Adanya kemungkinan banjir parah pada daerah ini pada ${timeHorizon} berikutnya akibat limpasan air kiriman dan intensitas hujan tinggi.`
                    : analysis.risk_level === 'High'
                    ? `⚠️ Adanya kemungkinan banjir sedang hingga tinggi pada daerah ini pada ${timeHorizon} berikutnya dengan estimasi genangan ${analysis.inundation_range}.`
                    : analysis.risk_level === 'Medium'
                    ? `Adanya potensi genangan air sedang pada cekungan jalan dan saluran drainase dalam rentang ${timeHorizon} ke depan.`
                    : `Kondisi daerah terpantau aman dan stabil dalam rentang ${timeHorizon} ke depan dengan risiko banjir minimal.`}
                </p>

                {/* Hydrologic Metrics Grid */}
                <div className="grid grid-cols-2 gap-0 text-xs border-y border-gray-200 dark:border-gray-700/50">
                  {/* Metric: Rainfall */}
                  <div className="p-2.5 border-r border-b border-gray-200 dark:border-gray-700/50">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[10px]">
                      <Droplets size={12} className="text-blue-500" />
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
                      <Clock size={12} className="text-indigo-500" />
                      <span>Status Muka Air</span>
                    </div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1 flex items-baseline gap-1">
                      <span>{analysis.water_level_cm}</span>
                      <span className="text-[10px] font-normal text-slate-400">cm</span>
                    </div>
                    <span
                      className={`inline-block px-1.5 py-0.2 rounded text-[9.5px] font-bold mt-0.5 border ${siagaClasses.bg} ${siagaClasses.text} ${siagaClasses.border}`}
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
                <HydrographChart
                  data={analysis.hydrograph}
                  riskLevel={analysis.risk_level}
                />
              </div>

              {/* SECTION 2: Recommendations / Early Warning Card */}
              <div className="glass-panel rounded-xl p-3 bg-slate-900/5 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-blue-500" />
                    Rekomendasi & Peringatan Dini
                  </span>
                  <span className="text-[10px] text-slate-400">Panduan Komuter</span>
                </div>

                {/* Commuter Action Advice */}
                <div className="p-2.5 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 flex items-start gap-2.5">
                  <Car size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-bold text-amber-800 dark:text-amber-200 mb-0.5">
                      Peringatan Pengendara:
                    </div>
                    <div className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed font-medium">
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
                      <Wind size={11} />
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

                {/* Safe Shelters & Emergency Contacts */}
                {analysis.safe_shelters && analysis.safe_shelters.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/60">
                    <div className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                      Posko Pengungsian Terdekat:
                    </div>
                    <div className="space-y-1.5">
                      {analysis.safe_shelters.map((shelter) => (
                        <div
                          key={shelter.id}
                          className="p-2 rounded-lg bg-white/40 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50 text-[11px]"
                        >
                          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                            <span>{shelter.name}</span>
                            <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                              Kapasitas: {shelter.capacity - shelter.occupancy} tersisa
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {shelter.address}
                          </div>
                          <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1 font-mono">
                            <PhoneCall size={10} />
                            {shelter.contact}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs">
              Pilih wilayah pada peta untuk melihat detail analisa.
            </div>
          )}
        </div>

        {/* BOTTOM PANEL CONTROLS: Theme Toggle Switch */}
        <div className="p-3 border-t border-slate-200/60 dark:border-slate-800/70 bg-slate-900/5 dark:bg-slate-900/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Tema Tampilan:
            </span>
            <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300/50 dark:border-slate-700">
              <button
                onClick={onToggleTheme}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sun size={12} className={theme === 'light' ? 'text-amber-500' : ''} />
                <span>Light</span>
              </button>
              <button
                onClick={onToggleTheme}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                  theme === 'dark'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Moon size={12} className={theme === 'dark' ? 'text-blue-400' : ''} />
                <span>Dark</span>
              </button>
            </div>
          </div>

          <div className="text-[10.5px] text-slate-400 font-mono">
            BPBD 112 • BMKG
          </div>
        </div>
      </aside>
    </>
  );
};
