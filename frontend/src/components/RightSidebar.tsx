'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Search,
  AlertTriangle,
  Droplets,
  Waves,
  Car,
  ChevronRight,
  ChevronLeft,
  Navigation,
  Play,
  Pause,
  MapPin,
  PhoneCall,
  Info,
  Sun,
  Moon,
} from 'lucide-react';
import { AreaAnalysisResponse, GeoJSONGridFeature, TimeHorizon } from '@/data/types';
import { getRiskBadgeClasses, getSiagaBadgeClasses, getColorForRainfall } from '@/utils/colorScale';
import { HydrographChart } from './HydrographChart';
import type { ActiveWarning } from '@/data/agent';
import { WARNING_LEVELS, formatWib } from '@/utils/warningStyle';
import { RoutePlanner, type RoutePlannerProps } from './RoutePlanner';
import { Disclosure } from './Disclosure';
import { RainForecast } from './RainForecast';
import { rainCategory } from '@/utils/rainCategory';
import { formatProbability } from '@/utils/formatProbability';
import { RISK_COLORS, colorAreas } from '@/utils/areaColors';

interface RightSidebarProps {
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  analysis: AreaAnalysisResponse | null;
  /** Areas currently on the map (the search box looks through these). */
  features: GeoJSONGridFeature[];
  isLoading: boolean;
  /** Name of the area just clicked, known from the heatmap before the analysis arrives. */
  selectedAreaName?: string | null;
  timeHorizon: TimeHorizon;
  onChangeTimeHorizon: (horizon: TimeHorizon) => void;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  onSelectRegionById: (gridId: string) => void;
  onOpenSearchModal: () => void;
  /** Active early warning for the selected area, from the Flood Watch Agent. */
  areaWarning?: ActiveWarning | null;
  /** Alternative-route planner (state and actions live in MapDashboard, the map draws the route). */
  planner: RoutePlannerProps;
}

type TabKey = 'ringkasan' | 'hujan' | 'saran';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'ringkasan', label: 'Ringkasan' },
  { key: 'hujan', label: 'Hujan' },
  { key: 'saran', label: 'Saran' },
];

const HORIZONS: TimeHorizon[] = ['1h', '3h', '5h', '12h', '24h'];

/** Same palette & thresholds as the landing page. */
const TIERS = [
  { name: 'Low', range: '< 0,8%', color: '#71A868' },
  { name: 'Medium', range: '0,8 - 2,15%', color: '#CE9F45' },
  { name: 'Medium-High', range: '2,15 - 3,3%', color: '#C9733F' },
  { name: 'High', range: '≥ 3,3%', color: '#B8514A' },
] as const;

const EXPLANATIONS = [
  {
    term: 'Probabilitas model',
    desc: 'Peluang terjadinya banjir di kecamatan ini, bukan persentase luas wilayah yang tergenang.',
  },
  {
    term: 'TMA',
    desc: 'Tinggi muka air di pos atau pintu air terdekat, dipantau per jam.',
  },
  {
    term: 'Status siaga',
    desc: 'Level resmi BPBD: Siaga 4 normal hingga Siaga 1 kritis.',
  },
] as const;

const EMERGENCY_CONTACTS = [
  { label: 'BPBD', number: '112' },
  { label: 'BNNP', number: '117' },
  { label: 'SAR', number: '115' },
  { label: 'Polisi', number: '110' },
  { label: 'Damkar', number: '113' },
  { label: 'Ambulans', number: '118' },
];

const tierIndex = (level: string): number => {
  switch (level) {
    case 'Low':
      return 0;
    case 'Medium':
      return 1;
    case 'Medium-High':
      return 2;
    case 'High':
    case 'Extreme':
      return 3;
    default:
      return -1;
  }
};

/* ───────────── small presentational helpers ───────────── */

const Row: React.FC<{
  icon: React.ReactNode;
  label: string;
  title?: string;
  children: React.ReactNode;
}> = ({ icon, label, title, children }) => (
  <div className="flex items-center gap-3 py-3">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]">
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] text-[#5F6368] dark:text-[#9AA0A6]" title={title}>
        {label}
      </p>
      <div className="text-sm font-semibold text-[#202124] dark:text-[#E8EAED]">{children}</div>
    </div>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F6368] dark:text-[#9AA0A6]">
    {children}
  </h3>
);

export const RightSidebar: React.FC<RightSidebarProps> = ({
  theme = 'dark',
  onToggleTheme,
  analysis,
  features,
  isLoading,
  selectedAreaName = null,
  timeHorizon,
  onChangeTimeHorizon,
  isSimulating,
  onToggleSimulation,
  onSelectRegionById,
  onOpenSearchModal,
  areaWarning = null,
  planner,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('ringkasan');

  const q = searchQuery.toLowerCase();
  const filteredLocations = features.filter(
    (zone) =>
      zone.properties.area_name.toLowerCase().includes(q) ||
      zone.properties.district.toLowerCase().includes(q) ||
      zone.properties.city.toLowerCase().includes(q) ||
      `kecamatan ${zone.properties.district}`.toLowerCase().includes(q) ||
      zone.properties.grid_id.toLowerCase().includes(q)
  );

  const riskClasses = analysis ? getRiskBadgeClasses(analysis.risk_level) : getRiskBadgeClasses('Medium');
  const siagaClasses = analysis ? getSiagaBadgeClasses(analysis.siaga_level) : getSiagaBadgeClasses('Normal');

  // Same colour the map paints this area with (relative to the other areas on screen).
  const mapColor = analysis
    ? colorAreas(features).find((c) => c.feature.properties.grid_id === analysis.grid_id)?.color
    : undefined;

  const highRiskAreas = features
    .filter((f) => f.properties.risk_level === 'High' || f.properties.risk_level === 'Extreme')
    .sort((a, b) => b.properties.flood_probability - a.properties.flood_probability);

  const isNoRisk = Boolean(analysis && analysis.risk_level === 'Low' && analysis.rainfall_mm === 0);
  const activeTier = analysis ? tierIndex(analysis.risk_level) : -1;
  const isElevated =
    analysis &&
    ['Medium', 'Medium-High', 'High', 'Extreme'].includes(analysis.risk_level) &&
    analysis.rainfall_mm < 1;

  const summaryText = !analysis
    ? ''
    : isNoRisk
    ? 'Kondisi wilayah terpantau aman. Tidak ada probabilitas hujan maupun indikasi genangan pada rentang waktu prakiraan.'
    : analysis.risk_level === 'Unknown'
    ? 'Data masukan belum lengkap, sehingga risiko banjir daerah ini tidak dapat dihitung.'
    : analysis.risk_level === 'Extreme' || analysis.risk_level === 'High'
    ? 'Model menilai peluang banjir di daerah ini tinggi dibanding hari-hari biasa. Pantau info resmi dan siapkan rencana.'
    : analysis.risk_level === 'Medium-High'
    ? 'Model menilai peluang banjir di daerah ini cukup tinggi, di atas rata-rata hari banjir tercatat. Waspada dan siapkan rute alternatif.'
    : analysis.risk_level === 'Medium'
    ? 'Model menilai peluang banjir di daerah ini sedang, di atas hari biasa. Tetap waspada.'
    : 'Model menilai peluang banjir di daerah ini rendah. Ini perkiraan, bukan jaminan aman.';

  const isLimitedData = analysis ? /terbatas|limited|low/i.test(analysis.confidence_badge) : false;
  const nearbyStations = (analysis?.nearby_stations ?? [])
    .filter((station) => station.name?.trim())
    .map((station) => ({
      ...station,
      name: station.name.trim().toLowerCase() === 'p a hek'
        ? 'P A Hek Kramat Jati'
        : station.name,
    }));

  return (
    <>
      {/* Collapse toggle (attached to the panel edge) */}
      <button
        onClick={() => setIsCollapsed((c) => !c)}
        className="fixed top-1/2 z-50 flex h-14 w-7 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 border-[#DADCE0] bg-white text-[#5F6368] shadow-md transition-[right] duration-300 hover:text-[#1A73E8] dark:border-[#3C4043] dark:bg-[#292A2D] dark:text-[#9AA0A6] dark:hover:text-[#8AB4F8]"
        style={{ right: isCollapsed ? 0 : 'min(410px, 100vw)' }}
        title={isCollapsed ? 'Buka Panel Analisa' : 'Sembunyikan Panel Analisa'}
        aria-label={isCollapsed ? 'Buka Panel Analisa' : 'Sembunyikan Panel Analisa'}
      >
        {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      <aside
        className={`sidebar-surface fixed inset-y-0 right-0 z-40 flex h-screen w-full flex-col overflow-hidden border-l border-[#DADCE0] bg-white text-[#202124] transition-transform duration-300 ease-in-out dark:border-[#3C4043] dark:bg-[#202124] dark:text-[#E8EAED] sm:w-[410px] ${
          isCollapsed ? 'pointer-events-none translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* ══════════ HEADER ══════════ */}
        <div className="px-4 pb-3 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Image
                src="/icon.svg"
                alt="Logo Pawang AI"
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover"
              />
              <span className="text-sm font-semibold tracking-tight">Pawang AI</span>
            </div>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="grid h-8 w-8 place-items-center rounded-full border border-[#DADCE0] text-[#5F6368] transition hover:bg-[#F8F9FA] dark:border-[#5F6368] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D]"
                title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
                aria-label={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            )}
          </div>

          {/* Search pill */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search size={16} className="pointer-events-none absolute left-4 text-[#5F6368] dark:text-[#9AA0A6]" />
              <input
                type="text"
                placeholder="Cari kecamatan atau klik dua kali pada peta"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                className="w-full rounded-full border border-[#DADCE0] bg-[#F8F9FA] py-2.5 pl-10 pr-20 text-xs text-[#202124] shadow-sm transition placeholder:text-[#5F6368] focus:border-[#1A73E8] focus:bg-white dark:focus:bg-[#292A2D] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30 dark:border-[#3C4043] dark:bg-[#292A2D] dark:text-[#E8EAED] dark:placeholder:text-[#9AA0A6] dark:focus:border-[#8AB4F8] dark:focus:ring-[#8AB4F8]/30"
              />
              <button
                type="button"
                onClick={onOpenSearchModal}
                className="absolute right-3 rounded-md border border-[#DADCE0] px-1.5 py-0.5 font-mono text-[10px] text-[#5F6368] hover:bg-white dark:border-[#5F6368] dark:text-[#9AA0A6] dark:hover:bg-[#202124]"
              >
                Ctrl+F
              </button>
            </div>

            {isSearchFocused && searchQuery && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-56 overflow-y-auto [scrollbar-gutter:stable] rounded-2xl border border-[#DADCE0] bg-white p-1.5 text-xs shadow-xl dark:border-[#3C4043] dark:bg-[#292A2D]">
                {filteredLocations.length > 0 ? (
                  filteredLocations.map((item) => (
                    <button
                      key={item.properties.grid_id}
                      onClick={() => {
                        onSelectRegionById(item.properties.grid_id);
                        setSearchQuery('');
                        setIsSearchFocused(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl p-2 text-left transition hover:bg-[#F1F3F4] dark:hover:bg-[#3C4043]/60"
                    >
                      <span className="flex items-center gap-2.5">
                        <MapPin size={14} className="shrink-0 text-[#1A73E8] dark:text-[#8AB4F8]" />
                        <span>
                          <span className="block text-xs font-medium leading-tight">{item.properties.area_name}</span>
                          <span className="text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">
                            {item.properties.district}, {item.properties.city}
                          </span>
                        </span>
                      </span>
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: getColorForRainfall(item.properties.rainfall_mm) }}
                      />
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-center text-xs text-[#5F6368] dark:text-[#9AA0A6]">
                    Daerah tidak ditemukan
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Forecast horizon */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex flex-1 items-center rounded-full bg-[#F1F3F4] p-0.5 dark:bg-[#292A2D]">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  onClick={() => onChangeTimeHorizon(h)}
                  className={`flex-1 rounded-full py-1 text-[11px] font-semibold transition ${
                    timeHorizon === h
                      ? 'bg-white text-[#1A73E8] shadow-sm dark:bg-[#3C4043] dark:text-[#8AB4F8]'
                      : 'text-[#5F6368] hover:text-[#202124] dark:text-[#9AA0A6] dark:hover:text-[#E8EAED]'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
            <button
              onClick={onToggleSimulation}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition ${
                isSimulating
                  ? 'border-transparent bg-[#1A73E8] text-white dark:bg-[#8AB4F8] dark:text-[#202124]'
                  : 'border-[#DADCE0] text-[#5F6368] hover:bg-[#F8F9FA] dark:border-[#5F6368] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D]'
              }`}
              title={isSimulating ? 'Jeda Simulasi' : 'Jalankan Simulasi Waktu'}
              aria-label={isSimulating ? 'Jeda Simulasi' : 'Jalankan Simulasi Waktu'}
            >
              {isSimulating ? <Pause size={14} /> : <Play size={14} />}
            </button>
          </div>
        </div>

        {/* ══════════ BODY ══════════ */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-[#DADCE0] dark:border-[#3C4043]">
          {isLoading ? (
            <div className="flex flex-1 flex-col gap-3 px-4 pt-4">
              {/* The name is shown at once from the map data; only the analysis and advice are still loading. */}
              {selectedAreaName && (
                <h2 className="mt-0.5 text-xl font-semibold leading-tight tracking-tight">{selectedAreaName}</h2>
              )}
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1A73E8] border-t-transparent dark:border-[#8AB4F8] dark:border-t-transparent" />
                <p className="text-xs text-[#5F6368] dark:text-[#9AA0A6]">Menganalisis risiko dan menyiapkan saran...</p>
              </div>
            </div>
          ) : analysis ? (
            <>
              {/* Tabs (Google Maps style) */}
              <div role="tablist" className="flex border-b border-[#DADCE0] px-2 dark:border-[#3C4043]">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={activeTab === t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`relative flex-1 py-2.5 text-xs font-semibold transition ${
                      activeTab === t.key
                        ? 'text-[#1A73E8] dark:text-[#8AB4F8]'
                        : 'text-[#5F6368] hover:text-[#202124] dark:text-[#9AA0A6] dark:hover:text-[#E8EAED]'
                    }`}
                  >
                    {t.label}
                    {activeTab === t.key && (
                      <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-[#1A73E8] dark:bg-[#8AB4F8]" />
                    )}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                {/* Area hero */}
                <div className="px-4 pb-3 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">
                        <Navigation size={11} className="shrink-0" />
                        <span className="truncate">
                          {analysis.city} • {analysis.district}
                        </span>
                      </p>
                      <h2 className="mt-0.5 text-xl font-semibold leading-tight tracking-tight">{analysis.area_name}</h2>
                      <p className="mt-1 font-mono text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">ID: {analysis.grid_id}</p>
                    </div>

                    <div
                      className="shrink-0 text-right"
                      title="Peluang banjir menurut model, bukan persentase wilayah yang tergenang"
                    >
                      <p
                        className={`text-3xl font-semibold leading-none tabular-nums ${mapColor ? '' : riskClasses.text}`}
                        style={mapColor ? { color: mapColor } : undefined}
                      >
                        {formatProbability(analysis.flood_probability) ?? '–'}
                      </p>
                      <p
                        className={`mt-1 text-[11px] font-semibold ${mapColor ? '' : riskClasses.text}`}
                        style={mapColor ? { color: mapColor } : undefined}
                      >
                        {riskClasses.label}
                      </p>
                    </div>
                  </div>

                  {/* Tier bar: active tier is highlighted */}
                  <div className="mt-4">
                    <div className="flex gap-1">
                      {TIERS.map((t, i) => (
                        <span
                          key={t.name}
                          className="h-1.5 flex-1 rounded-full transition-opacity"
                          style={{ backgroundColor: t.color, opacity: i === activeTier ? 1 : 0.25 }}
                        />
                      ))}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">
                      <span>Peluang banjir (model)</span>
                      <span>{analysis.target_date ? `untuk ${analysis.target_date}` : `prakiraan ${timeHorizon}`}</span>
                    </div>
                  </div>
                </div>

                {/* Tab content */}
                <div className="px-4 pb-4 pt-1">
                  {/* ───── RINGKASAN ───── */}
                  {activeTab === 'ringkasan' && (
                    <div className="space-y-4">
                      {areaWarning && (
                        <div
                          className="rounded-2xl border-l-4 bg-[#F8F9FA] p-3 dark:bg-[#292A2D]"
                          style={{ borderLeftColor: WARNING_LEVELS[areaWarning.level]?.color }}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold">Peringatan dini aktif</span>
                            <span className="font-bold uppercase" style={{ color: WARNING_LEVELS[areaWarning.level]?.color }}>
                              {WARNING_LEVELS[areaWarning.level]?.label ?? areaWarning.level}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-snug text-[#3C4043] dark:text-[#E8EAED]/90">{areaWarning.message}</p>
                          <p className="mt-1 text-[10.5px] text-[#5F6368] dark:text-[#9AA0A6]">
                            Sejak {formatWib(areaWarning.since)} WIB · dari agen pemantau, cek info resmi BPBD
                          </p>
                        </div>
                      )}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-semibold">
                            <AlertTriangle size={14} className="text-[#1A73E8] dark:text-[#8AB4F8]" />
                            Hasil Model
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                              isLimitedData
                                ? 'bg-[#FEF7E0] text-[#B06000] dark:bg-[#F9AB00]/15 dark:text-[#FDD663]'
                                : 'bg-[#E6F4EA] text-[#188038] dark:bg-[#34A853]/15 dark:text-[#81C995]'
                            }`}
                            title="Data lengkap = hujan dan tinggi muka air tersedia dan terbaru. Data terbatas = model berjalan dengan data kurang lengkap, jadi perlakukan sebagai perkiraan kasar."
                          >
                            {analysis.confidence_badge}
                          </span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-[#3C4043] dark:text-[#E8EAED]/90">{summaryText}</p>

                        {isElevated && (
                          <p className="mt-3 rounded-2xl bg-[#FEF7E0] p-3 text-[11px] leading-relaxed text-[#7A4F01] dark:bg-[#F9AB00]/10 dark:text-[#FDD663]">
                            <b>Mengapa berisiko padahal hampir tidak hujan?</b> Model tidak hanya melihat hujan hari ini,
                            tetapi juga curah hujan 1-30 hari terakhir, tinggi muka air (bila tersedia), dan elevasi
                            wilayah. Penyebab spesifik per wilayah tidak tersedia.
                          </p>
                        )}
                      </div>

                      {/* Metrics list */}
                      <div className="divide-y divide-[#DADCE0] border-y border-[#DADCE0] dark:divide-[#3C4043] dark:border-[#3C4043]">
                        <Row
                          icon={<Droplets size={16} />}
                          label="Curah hujan (per hari)"
                          title="Total curah hujan prakiraan untuk hari yang diprediksi"
                        >
                          <span className="tabular-nums">{isNoRisk ? 0 : analysis.rainfall_mm}</span>
                          <span className="ml-1 text-[11px] font-normal text-[#5F6368] dark:text-[#9AA0A6]">mm/hari</span>
                          <span
                            className="ml-2 text-[11px] font-semibold"
                            style={{ color: getColorForRainfall(analysis.rainfall_mm) }}
                          >
                            {rainCategory(analysis.rainfall_mm).label}
                          </span>
                        </Row>
                        <Row
                          icon={<Waves size={16} />}
                          label={nearbyStations.length > 0
                            ? `Tinggi muka air sungai (per jam) ${nearbyStations[0].name}`
                            : 'Tinggi muka air sungai (per jam)'}
                          title="Tinggi air di pos pemantau sungai/pintu air terdekat (TMA) per jam"
                        >
                          {analysis.water_level_cm != null ? (
                            <>
                              <span className="tabular-nums">{analysis.water_level_cm}</span>
                              <span className="ml-1 text-[11px] font-normal text-[#5F6368] dark:text-[#9AA0A6]">cm</span>
                            </>
                          ) : (
                            <span className="text-[#5F6368] dark:text-[#9AA0A6]">Belum tersedia</span>
                          )}
                          <span className={`ml-2 text-[11px] font-semibold ${siagaClasses.text}`}>
                            {isNoRisk
                              ? 'Normal'
                              : nearbyStations[0]?.status ?? analysis.siaga_level}
                          </span>
                        </Row>
                      </div>

                      <div>
                        <SectionTitle>
                          {nearbyStations[0]?.name ? `  ${nearbyStations[0].name}` : ''}
                        </SectionTitle>
                        <HydrographChart
                          data={analysis.hydrograph}
                          currentLevel={analysis.water_level_cm}
                        />
                      </div>

                      <Disclosure
                        title="Penjelasan prediksi"
                        icon={<Info size={13} className="text-[#1A73E8] dark:text-[#8AB4F8]" />}
                      >
                        <ul className="divide-y divide-[#DADCE0] dark:divide-[#3C4043]">
                          {EXPLANATIONS.map((e) => (
                            <li key={e.term} className="px-3.5 py-3">
                              <p className="text-xs font-semibold">{e.term}</p>
                              <p className="mt-0.5 text-[12px] leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
                                {e.desc}
                              </p>
                            </li>
                          ))}

                          <li className="px-3.5 py-3">
                            <p className="text-xs font-semibold">Kategori risiko</p>
                            <p className="mt-0.5 text-[12px] leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
                              Dikelompokkan dari persen peluang dengan batas tetap. Ini perkiraan, bukan kepastian.
                            </p>
                            <ul className="mt-2.5 grid grid-cols-2 gap-1.5">
                              {TIERS.map((t, i) => (
                                <li
                                  key={t.name}
                                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${
                                    i === activeTier
                                      ? 'border-[#1A73E8] bg-[#E8F0FE] dark:border-[#8AB4F8] dark:bg-[#1A73E8]/10'
                                      : 'border-[#DADCE0] dark:border-[#3C4043]'
                                  }`}
                                >
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: t.color }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-[11px] font-semibold leading-tight">{t.name}</span>
                                    <span className="block text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">{t.range}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">
                              Warna yang sama dipakai di peta dan pada angka peluang.
                            </p>
                          </li>
                        </ul>
                      </Disclosure>
                    </div>
                  )}

                  {/* ───── HUJAN ───── */}
                  {activeTab === 'hujan' && (
                    <div className="space-y-4">
                      <div className="flex items-end justify-between border-b border-[#DADCE0] pb-4 dark:border-[#3C4043]">
                        <div>
                          <p className="text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">Curah hujan hari prakiraan</p>
                          <p className="mt-1 text-3xl font-semibold leading-none tabular-nums">
                            {isNoRisk ? 0 : analysis.rainfall_mm}
                            <span className="ml-1 text-xs font-normal text-[#5F6368] dark:text-[#9AA0A6]">mm/hari</span>
                          </p>
                        </div>
                        <span
                          className="rounded-full px-3 py-1 text-[11px] font-semibold"
                          style={{
                            color: getColorForRainfall(analysis.rainfall_mm),
                            backgroundColor: `${getColorForRainfall(analysis.rainfall_mm)}22`,
                          }}
                        >
                          {rainCategory(analysis.rainfall_mm).label}
                        </span>
                      </div>

                      <RainForecast
                        rainfallMm={analysis.rainfall_mm}
                        probabilityPct={analysis.rain_probability_pct}
                        targetDate={analysis.target_date}
                        daily={analysis.rain_daily ?? []}
                      />
                    </div>
                  )}

                  {/* ───── SARAN ───── */}
                  {activeTab === 'saran' && (
                    <div className="space-y-5">
                      {/* Evacuation route */}
                      <section>
                        <SectionTitle>Jalur alternatif</SectionTitle>
                        <RoutePlanner {...planner} />
                      </section>

                      {/* Affected roads */}
                      {analysis.affected_roads && analysis.affected_roads.length > 0 && (
                        <section>
                          <SectionTitle>Ruas jalan terdampak genangan</SectionTitle>
                          <div className="flex flex-wrap gap-1.5">
                            {analysis.affected_roads.map((road, i) => (
                              <span
                                key={i}
                                className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] px-3 py-1 text-[11px] font-medium dark:border-[#3C4043]"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-[#B8514A]" />
                                {road}
                              </span>
                            ))}
                          </div>
                        </section>
                      )}

                      {/* High-risk districts */}
                      <section>
                        <SectionTitle>
                          <span className="inline-flex items-center gap-1.5">
                            <Car size={12} /> Kecamatan risiko tinggi ({highRiskAreas.length})
                          </span>
                        </SectionTitle>
                        {highRiskAreas.length === 0 ? (
                          <p className="rounded-2xl bg-[#F8F9FA] p-3.5 text-xs text-[#5F6368] dark:bg-[#292A2D] dark:text-[#9AA0A6]">
                            Tidak ada kecamatan berisiko tinggi pada hari prakiraan ini.
                          </p>
                        ) : (
                          <ul className="max-h-44 divide-y divide-[#DADCE0] overflow-y-auto [scrollbar-gutter:stable] rounded-2xl border border-[#DADCE0] dark:divide-[#3C4043] dark:border-[#3C4043]">
                            {highRiskAreas.map((f) => (
                              <li key={f.properties.grid_id}>
                                <button
                                  type="button"
                                  onClick={() => onSelectRegionById(f.properties.grid_id)}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-[#F1F3F4] dark:hover:bg-[#292A2D]"
                                >
                                  <span className="flex items-center gap-2 font-medium">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RISK_COLORS.High }} />
                                    {f.properties.area_name}
                                  </span>
                                  <span className="font-mono tabular-nums text-[#5F6368] dark:text-[#9AA0A6]">
                                    {formatProbability(f.properties.flood_probability) ?? '–'}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>

                      {/* Emergency contacts */}
                      <section>
                        <SectionTitle>Nomor darurat</SectionTitle>
                        <div className="grid grid-cols-3 gap-2">
                          {EMERGENCY_CONTACTS.map((c) => (
                            <a
                              key={c.label}
                              href={`tel:${c.number}`}
                              className="flex flex-col items-center gap-0.5 rounded-2xl border border-[#DADCE0] py-2.5 transition hover:border-[#1A73E8] hover:bg-[#E8F0FE] dark:border-[#3C4043] dark:hover:border-[#8AB4F8] dark:hover:bg-[#1A73E8]/10"
                            >
                              <PhoneCall size={13} className="text-[#1A73E8] dark:text-[#8AB4F8]" />
                              <span className="text-[11px] font-medium">{c.label}</span>
                              <span className="font-mono text-xs font-bold">{c.number}</span>
                            </a>
                          ))}
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]">
                <MapPin size={22} />
              </span>
              <p className="text-sm font-medium">Pilih wilayah pada peta</p>
              <p className="text-xs text-[#5F6368] dark:text-[#9AA0A6]">
                Cari kecamatan atau klik dua kali pada peta untuk melihat detail analisa.
              </p>
            </div>
          )}
        </div>

        {/* ══════════ FOOTER ══════════ */}
        <div className="border-t border-[#DADCE0] px-4 py-2.5 text-[10px] leading-relaxed text-[#5F6368] dark:border-[#3C4043] dark:text-[#9AA0A6]">
          Prediksi menggunakan learning model dengan guardrails dan dievaluasi oleh agentic AI, data belum tentu 100%
          akurat. Bukan pengganti informasi resmi BPBD.
        </div>
      </aside>
    </>
  );
};