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
  Info,
  CloudRain,
  Sun,
  Moon,
} from 'lucide-react';
import { AreaAnalysisResponse, GeoJSONGridFeature, TimeHorizon } from '@/data/types';
import { getRiskBadgeClasses, getSiagaBadgeClasses, getColorForRainfall } from '@/utils/colorScale';
import { HydrographChart } from './HydrographChart';
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
  timeHorizon: TimeHorizon;
  onChangeTimeHorizon: (horizon: TimeHorizon) => void;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  onSelectRegionById: (gridId: string) => void;
  onOpenSearchModal: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  theme = 'dark',
  onToggleTheme,
  analysis,
  features,
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
  const filteredLocations = features.filter((zone) =>
    zone.properties.area_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    zone.properties.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
    zone.properties.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `kecamatan ${zone.properties.district}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    zone.properties.grid_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const riskClasses = analysis
    ? getRiskBadgeClasses(analysis.risk_level)
    : getRiskBadgeClasses('Medium');

  // Same colour the map paints this area with (relative to the other areas on screen).
  const mapColor = analysis
    ? colorAreas(features).find((c) => c.feature.properties.grid_id === analysis.grid_id)?.color
    : undefined;

  const highRiskAreas = features
    .filter((f) => f.properties.risk_level === 'High' || f.properties.risk_level === 'Extreme')
    .sort((a, b) => b.properties.flood_probability - a.properties.flood_probability);

  const siagaClasses = analysis
    ? getSiagaBadgeClasses(analysis.siaga_level)
    : getSiagaBadgeClasses('Normal');
  const emergencyContacts = [
    { label: 'BPBD', number: '112' },
    { label: 'BNNP', number: '117' },
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
        className="fixed top-1/2 z-50 flex h-14 w-7 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-[#22396F] bg-[#FFEBCC] text-[#010736] transition-[right] duration-300 hover:bg-[#FFF9D2] dark:border-[#22396F] dark:bg-[#0D1C42] dark:text-[#FCF1D0] dark:hover:bg-[#22396F]"
        style={{ right: isCollapsed ? 0 : 'min(410px, 100vw)' }}
        title={isCollapsed ? 'Buka Panel Analisa' : 'Sembunyikan Panel Analisa'}
        aria-label={isCollapsed ? 'Buka Panel Analisa' : 'Sembunyikan Panel Analisa'}
      >
        {isCollapsed ? (
          <ChevronLeft size={16} className="text-[#010736] dark:text-[#FCF1D0]" />
        ) : (
          <ChevronRight size={16} className="text-[#010736] dark:text-[#FCF1D0]" />
        )}
      </button>

      {/* Full-height right panel */}
      <aside
        className={`sidebar-surface fixed inset-y-0 right-0 z-40 flex h-screen w-full flex-col overflow-hidden border-l border-[#22396F] bg-[#FFEBCC] transition-transform duration-300 ease-in-out dark:border-[#22396F] dark:bg-[#0D1C42] sm:w-[410px] ${
          isCollapsed ? 'translate-x-full pointer-events-none' : 'translate-x-0'
        }`}
      >
        {/* Panel Header & Search Bar */}
        <div className="border-b border-[#22396F] bg-[#FFEBCC] p-3.5 pb-2.5 dark:border-[#22396F] dark:bg-[#0D1C42]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center">
              <span className="text-sm font-bold leading-relaxed text-[#010736] dark:text-[#FCF1D0]">
                Periksa Daerah
              </span>
            </div>

            {/* Mode Switcher Button on the top right above search bar */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#22396F] bg-[#FFF9D2] text-[#010736] hover:bg-[#8CC0EB]/30 dark:border-[#22396F] dark:bg-[#010736] dark:text-[#FCF1D0] dark:hover:bg-[#22396F] transition-all text-xs font-semibold shadow-xs"
                title={theme === 'dark' ? 'Ganti ke Mode Terang (Light Mode)' : 'Ganti ke Mode Gelap (Dark Mode)'}
                aria-label={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun size={13} className="text-[#FCF1D0]" />
                    <span className="text-[11px] font-semibold tracking-wide">Light</span>
                  </>
                ) : (
                  <>
                    <Moon size={13} className="text-[#010736]" />
                    <span className="text-[11px] font-semibold tracking-wide">Dark</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Search Bar with Shortcut Indicator */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 text-[#22396F] dark:text-[#BFDDF0]"
              />
              <input
                type="text"
                placeholder="ketik daerah atau klik dua kali pada peta"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                className="w-full rounded-xl border border-[#22396F] bg-[#FFF9D2] py-2 pl-9 pr-16 text-xs leading-relaxed text-[#010736] transition-all placeholder:text-[#22396F]/60 placeholder:italic focus:outline-none focus:ring-2 focus:ring-[#8CC0EB] dark:border-[#22396F] dark:bg-[#010736] dark:text-[#FCF1D0] dark:placeholder:text-[#FCF1D0]/40 dark:focus:ring-[#22396F]"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <kbd
                  onClick={onOpenSearchModal}
                  className="cursor-pointer rounded border border-[#22396F] bg-[#FFEBCC] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#010736] dark:border-[#22396F] dark:bg-[#0D1C42] dark:text-[#FCF1D0]"
                >
                  Ctrl+F
                </kbd>
              </div>
            </div>

            {/* Live Search Suggestions Dropdown */}
            {isSearchFocused && searchQuery && (
              <div className="absolute left-0 right-0 top-full mt-1.5 rounded-xl shadow-2xl p-1 z-50 max-h-56 overflow-y-auto border border-[#22396F] bg-[#FFEBCC] dark:border-[#22396F] dark:bg-[#0D1C42] text-xs">
                {filteredLocations.length > 0 ? (
                  filteredLocations.map((item) => (
                    <button
                      key={item.properties.grid_id}
                      onClick={() => {
                        onSelectRegionById(item.properties.grid_id);
                        setSearchQuery('');
                        setIsSearchFocused(false);
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-[#BFDDF0]/50 dark:hover:bg-[#22396F]/50 flex items-center justify-between text-[#010736] dark:text-[#FCF1D0] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-[#8CC0EB] dark:text-[#FCF1D0] shrink-0" />
                        <div>
                          <div className="font-semibold text-xs leading-tight text-[#010736] dark:text-[#FCF1D0]">
                            {item.properties.area_name}
                          </div>
                          <div className="text-[10px] text-[#22396F] dark:text-[#BFDDF0]">
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
                  <div className="p-3 text-center text-[#22396F] dark:text-[#BFDDF0] text-xs text-justify">
                    Daerah tidak ditemukan
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Time Horizon Forecast Selector */}
          <div className="mt-2.5 pt-2 border-t border-[#22396F]/70 dark:border-[#22396F]/70 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#010736] dark:text-[#FCF1D0]">
                Prakiraan:
              </span>
              <div className="flex items-center bg-[#FFF9D2] dark:bg-[#010736] p-0.5 rounded-lg border border-[#22396F] dark:border-[#22396F]">
                {(['1h', '3h', '5h', '12h', '24h'] as TimeHorizon[]).map((horizon) => (
                  <button
                    key={horizon}
                    onClick={() => onChangeTimeHorizon(horizon)}
                    className={`px-2 py-0.5 text-[10.5px] font-semibold rounded-md transition-all ${
                      timeHorizon === horizon
                        ? 'bg-[#8CC0EB] text-[#010736] dark:bg-[#22396F] dark:text-[#FCF1D0] shadow-xs'
                        : 'text-[#22396F] dark:text-[#D5E2F7] hover:text-[#010736] dark:hover:text-[#FCF1D0]'
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
              className={`p-1.5 rounded-lg flex items-center gap-1 text-[10.5px] font-semibold border border-[#22396F] dark:border-[#22396F] transition-colors ${
                isSimulating
                  ? 'bg-[#8CC0EB] text-[#010736] dark:bg-[#22396F] dark:text-[#FCF1D0]'
                  : 'bg-[#FFF9D2] text-[#010736] hover:bg-[#BFDDF0]/50 dark:bg-[#010736] dark:text-[#FCF1D0] dark:hover:bg-[#22396F]'
              }`}
              title={isSimulating ? 'Jeda Simulasi' : 'Jalankan Simulasi Waktu'}
            >
              {isSimulating ? (
                <Pause size={13} className="text-[#010736] dark:text-[#FCF1D0]" />
              ) : (
                <Play size={13} className="text-[#010736] dark:text-[#FCF1D0]" />
              )}
              <span className="hidden xs:inline">{isSimulating ? 'Stop' : 'Play'}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#22396F] dark:border-[#FCF1D0] border-t-transparent animate-spin" />
              <p className="text-xs text-[#22396F] dark:text-[#BFDDF0] font-medium text-justify">
                Mengambil data hidrologi satelit & sensor...
              </p>
            </div>
          ) : analysis ? (
            <>
              {/* Selected Area Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#22396F] dark:text-[#BFDDF0] font-bold uppercase tracking-wider">
                    <Navigation size={11} className="shrink-0 text-[#8CC0EB] dark:text-[#FCF1D0]" />
                    <span>{analysis.city} • {analysis.district}</span>
                  </div>
                  <h2 className="text-base font-extrabold text-[#010736] dark:text-[#FCF1D0] leading-tight mt-0.5">
                    {analysis.area_name}
                  </h2>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`text-[11px] font-bold ${mapColor ? '' : riskClasses.text}`}
                    style={mapColor ? { color: mapColor } : undefined}
                  >
                    {riskClasses.label}
                  </span>
                  <div
                    className="flex flex-col items-end leading-none"
                    title="Peluang banjir menurut model, bukan persentase wilayah yang tergenang"
                  >
                    <span
                      className={`text-xl font-extrabold tabular-nums ${mapColor ? '' : riskClasses.text}`}
                      style={mapColor ? { color: mapColor } : undefined}
                    >
                      {formatProbability(analysis.flood_probability) ?? '–'}
                    </span>
                    <span className="mt-0.5 text-[9px] uppercase tracking-wider text-[#22396F] dark:text-[#BFDDF0]">
                      Peluang banjir (model)
                    </span>
                    <span className="mt-0.5 text-[9px] normal-case text-[#22396F]/80 dark:text-[#D5E2F7]">
                      {analysis.target_date ? `untuk ${analysis.target_date}` : `prakiraan ${timeHorizon}`}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#22396F] dark:text-[#BFDDF0]">
                    ID: {analysis.grid_id}
                  </span>
                </div>
              </div>

              {/* Penjelasan prediksi (tersembunyi sampai diklik) */}
              <Disclosure
                title="Penjelasan prediksi"
                icon={<Info size={13} className="text-[#8CC0EB] dark:text-[#FCF1D0]" />}
              >
                  <ul className="list-disc space-y-1.5 px-3 pb-3 pl-7 leading-relaxed text-[#010736] dark:text-[#FCF1D0] text-justify">
                    <li className="text-justify">
                      <b>Probabilitas banjir</b>: peluang menurut model bahwa banjir terjadi di wilayah ini pada hari
                      yang diprediksi, dihitung dari pola hujan, tinggi muka air, dan data banjir tahun-tahun lalu.
                    </li>
                    <li className="text-justify">
                      <b>Persen</b>: bukan luas wilayah yang tergenang. Banjir jarang terjadi, jadi angka kecil
                      (misalnya 5-7%) sudah jauh di atas hari biasa. Bandingkan antar wilayah dan antar hari.
                    </li>
                    <li className="text-justify">
                      <b>Risk</b> (Low / Medium / Medium-High / High): kategori dari persen tersebut, dengan batas tetap
                      (Low di bawah 0,8%, Medium 0,8-2,15%, Medium-High 2,15-3,3%, High mulai 3,3%). Ini perkiraan,
                      bukan kepastian.
                    </li>
                    <li className="text-justify">
                      <b>Warna</b> (di peta dan pada angka risk ini) mengikuti kategori: hijau = Low, kuning = Medium,
                      oranye = Medium-High, merah = High.
                    </li>
                    <li className="text-justify">
                      <b>Prakiraan 1h-24h</b>: model memprediksi per hari. Pilihan jam hanya menentukan hari mana yang
                      dimaksud (hari ini atau besok).
                    </li>
                    <li className="text-justify">
                      <b>Tinggi muka air (TMA)</b>: tinggi air di pos pemantau sungai/pintu air terdekat, bukan tinggi
                      genangan di jalan. <b>Siaga</b> adalah status BPBD untuk TMA di pos itu (Siaga 1 paling tinggi).
                    </li>
                  </ul>
              </Disclosure>

              {/* Perkiraan hujan (tersembunyi sampai diklik) */}
              <Disclosure
                title="Perkiraan hujan"
                icon={<CloudRain size={13} className="text-[#8CC0EB] dark:text-[#FCF1D0]" />}
              >
                <RainForecast
                  rainfallMm={analysis.rainfall_mm}
                  probabilityPct={analysis.rain_probability_pct}
                  targetDate={analysis.target_date}
                  daily={analysis.rain_daily ?? []}
                />
              </Disclosure>

              {/* SECTION 1: Overview Analisa Card */}
              <div className="min-h-[270px] space-y-3 rounded-xl border border-[#22396F] bg-[#FFF9D2]/70 p-3 dark:border-[#22396F] dark:bg-[#010736]/70 shadow-sm">
                <div className="flex w-full items-start text-left">
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-[#010736] dark:text-[#FCF1D0]">
                      <AlertTriangle size={14} className="text-[#8CC0EB] dark:text-[#FCF1D0]" />
                      Overview Analisa AI
                    </span>
                    <span
                      className={`text-[10px] font-semibold ${
                        /terbatas|limited|low/i.test(analysis.confidence_badge)
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                      title="Data lengkap = hujan dan tinggi muka air tersedia dan terbaru. Data terbatas = model berjalan dengan data kurang lengkap, jadi perlakukan sebagai perkiraan kasar."
                    >
                      {analysis.confidence_badge}
                    </span>
                  </span>
                </div>

                {/* High-level AI Summary Text */}
                <p className="min-h-[72px] text-justify text-xs text-[#010736] dark:text-[#FCF1D0] leading-relaxed font-medium p-2.5 border-y border-[#22396F] dark:border-[#22396F]">
                  {isNoRisk
                    ? 'Kondisi wilayah terpantau aman. Tidak terdapat probabilitas presipitasi maupun indikasi genangan air pada area ini untuk rentang waktu perkiraan.'
                    : analysis.risk_level === 'Unknown'
                    ? 'Data masukan belum lengkap, sehingga risiko banjir daerah ini tidak dapat dihitung.'
                    : analysis.risk_level === 'Extreme' || analysis.risk_level === 'High'
                    ? 'Model menilai peluang banjir di daerah ini tinggi dibanding hari-hari biasa. Pantau info resmi dan siapkan rencana.'
                    : analysis.risk_level === 'Medium-High'
                    ? 'Model menilai peluang banjir di daerah ini cukup tinggi, di atas rata-rata hari banjir tercatat. Waspada dan siapkan rute alternatif.'
                    : analysis.risk_level === 'Medium'
                    ? 'Model menilai peluang banjir di daerah ini sedang, di atas hari biasa. Tetap waspada.'
                    : 'Model menilai peluang banjir di daerah ini rendah. Ini perkiraan, bukan jaminan aman.'}
                </p>
                {(analysis.risk_level === 'Medium' || analysis.risk_level === 'Medium-High' || analysis.risk_level === 'High' || analysis.risk_level === 'Extreme') &&
                  analysis.rainfall_mm < 1 && (
                    <p className="text-justify rounded-md bg-amber-500/15 p-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200 border border-amber-500/30">
                      <b>Mengapa berisiko padahal hampir tidak hujan?</b> Model tidak hanya melihat hujan hari
                      ini. Ia juga memakai curah hujan 1-30 hari terakhir, tinggi muka air (bila tersedia), dan
                      elevasi wilayah. Penyebab spesifik per wilayah tidak tersedia.
                    </p>
                  )}

                {/* Hydrologic Metrics Grid */}
                <div className="text-center text-[10px] font-bold uppercase tracking-wider text-[#22396F] dark:text-[#FCF1D0]">
                  Informasi Lanjut
                </div>
                <div className="grid grid-cols-2 gap-0 text-xs border-y border-[#22396F] dark:border-[#22396F]">
                  {/* Metric: Rainfall */}
                  <div className="p-2.5 border-r border-[#22396F] dark:border-[#22396F]">
                    <div className="flex items-center gap-1.5 text-[#22396F] dark:text-[#BFDDF0] text-[10px] font-medium">
                      <Droplets size={12} className="text-[#8CC0EB] dark:text-[#FCF1D0]" />
                      <span title="Total curah hujan prakiraan untuk hari yang diprediksi">Curah Hujan (per hari)</span>
                    </div>
                    <div className="text-sm font-bold text-[#010736] dark:text-[#FCF1D0] mt-1 flex items-baseline gap-1">
                      <span>{isNoRisk ? 0 : analysis.rainfall_mm}</span>
                      <span className="text-[10px] font-normal text-[#22396F] dark:text-[#BFDDF0]">mm/hari</span>
                    </div>
                    <div
                      className="text-[9.5px] font-semibold mt-0.5"
                      style={{ color: getColorForRainfall(analysis.rainfall_mm) }}
                    >
                      {rainCategory(analysis.rainfall_mm).label}
                    </div>
                  </div>

                  {/* Metric: Water Level (TMA) */}
                  <div className="p-2.5">
                    <div className="flex items-center gap-1.5 text-[#22396F] dark:text-[#BFDDF0] text-[10px] font-medium">
                      <Clock size={12} className="text-[#8CC0EB] dark:text-[#FCF1D0]" />
                      <span title="Tinggi air di pos pemantau sungai/pintu air terdekat (TMA), bukan tinggi genangan di jalan">
                        Tinggi Muka Air Sungai
                      </span>
                    </div>
                    <div className="text-sm font-bold text-[#010736] dark:text-[#FCF1D0] mt-1 flex items-baseline gap-1">
                      <span>{analysis.water_level_cm ?? 'Belum tersedia'}</span>
                      {analysis.water_level_cm != null && (
                        <span className="text-[10px] font-normal text-[#22396F] dark:text-[#BFDDF0]">cm</span>
                      )}
                    </div>
                    <span
                      className={`text-[9.5px] font-bold ${siagaClasses.text}`}
                    >
                      {isNoRisk ? 'Aman' : analysis.siaga_level}
                    </span>
                  </div>
                </div>

                {/* Hydrograph Curve Chart */}
                <div className="border-b border-[#22396F] pb-3 dark:border-[#22396F]">
                  <HydrographChart
                    data={analysis.hydrograph}
                  />
                </div>
              </div>

              {/* SECTION 2: Recommendations / Early Warning Card */}
              <div className="rounded-xl p-3 bg-[#FFF9D2]/70 dark:bg-[#010736]/70 border border-[#22396F] dark:border-[#22396F] space-y-3 shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#010736] dark:text-[#FCF1D0] flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-[#8CC0EB] dark:text-[#FCF1D0]" />
                    Rekomendasi & Peringatan Dini
                  </span>
                  <span className="text-[10px] text-[#22396F] dark:text-[#BFDDF0] font-medium">Panduan Komuter</span>
                </div>

                {/* Kecamatan with High risk (highest probability first) */}
                <div className="p-2.5 rounded-lg bg-[#BFDDF0]/40 dark:bg-[#22396F]/40 border border-[#22396F]/60 dark:border-[#22396F]">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#010736] dark:text-[#FCF1D0]">
                    <Car size={16} className="shrink-0" />
                    Kecamatan Risiko Tinggi ({highRiskAreas.length})
                  </div>
                  {highRiskAreas.length === 0 ? (
                    <div className="text-xs font-medium text-[#0D1C42] dark:text-[#FCF1D0]/90">
                      Tidak ada kecamatan berisiko tinggi pada hari prakiraan ini.
                    </div>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                      {highRiskAreas.map((f) => (
                        <li key={f.properties.grid_id}>
                          <button
                            type="button"
                            onClick={() => onSelectRegionById(f.properties.grid_id)}
                            className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs font-medium text-[#010736] hover:bg-[#8CC0EB]/30 dark:text-[#FCF1D0] dark:hover:bg-[#22396F]"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RISK_COLORS.High }} />
                              {f.properties.area_name}
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatProbability(f.properties.flood_probability) ?? '–'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Evacuation Route Advice */}
                <div className="p-2.5 rounded-lg bg-[#BFDDF0]/40 dark:bg-[#22396F]/40 border border-[#22396F]/60 dark:border-[#22396F] flex items-start gap-2.5">
                  <Compass size={16} className="text-[#010736] dark:text-[#FCF1D0] shrink-0 mt-0.5" />
                  <div className="text-xs w-full">
                    <div className="font-bold text-[#010736] dark:text-[#FCF1D0] mb-0.5">
                      Jalur Alternatif / Evakuasi Bebas Banjir:
                    </div>
                    <div className="text-justify text-[#0D1C42] dark:text-[#FCF1D0]/90 leading-relaxed font-medium">
                      {analysis.evacuation_route}
                    </div>
                  </div>
                </div>

                {/* Affected Roads Tag List */}
                {analysis.affected_roads && analysis.affected_roads.length > 0 && (
                  <div>
                    <div className="text-[10.5px] font-semibold text-[#010736] dark:text-[#FCF1D0] mb-1.5 flex items-center gap-1">
                      <Wind size={11} className="text-[#8CC0EB] dark:text-[#FCF1D0]" />
                      Ruas Jalan Terdampak Genangan:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.affected_roads.map((road, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-[#BFDDF0] dark:bg-[#22396F] text-[#010736] dark:text-[#FCF1D0] border border-[#22396F]/60 dark:border-[#22396F] flex items-center gap-1"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          {road}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-[#22396F] pt-2 dark:border-[#22396F]">
                  <div className="mb-1.5 text-[10.5px] font-bold text-[#010736] dark:text-[#FCF1D0]">
                    Nomor Darurat
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {emergencyContacts.map((contact) => (
                      <a
                        key={contact.label}
                        href={`tel:${contact.number}`}
                        className="flex items-center justify-between rounded-md border border-[#22396F] bg-[#FFF9D2]/70 px-2 py-1.5 text-[10.5px] text-[#010736] hover:bg-[#8CC0EB]/30 dark:border-[#22396F] dark:bg-[#010736]/70 dark:text-[#FCF1D0] dark:hover:bg-[#22396F] transition-colors"
                      >
                        <span className="flex items-center gap-1 font-medium">
                          <PhoneCall size={10} className="text-[#8CC0EB] dark:text-[#FCF1D0]" />
                          {contact.label}
                        </span>
                        <span className="font-mono font-bold text-[#010736] dark:text-[#FCF1D0]">{contact.number}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-[#22396F] dark:text-[#BFDDF0] text-xs text-justify">
              Pilih wilayah pada peta untuk melihat detail analisa.
            </div>
          )}
        </div>

        <div className="border-t border-[#22396F] px-3 py-2 text-justify text-[9.5px] leading-relaxed text-[#22396F] dark:border-[#22396F] dark:text-[#BFDDF0]">
          Prediksi menggunakan learning model dengan guardrails dan dievaluasi oleh agentic AI, data belum tentu 100% akurat
        </div>
      </aside>
    </>
  );
};
