'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  MapPinned,
  CloudSun,
  CloudRain,
  Waves,
  Route,
  Menu,
  X,
  Sun,
  Moon,
  Clock,
} from 'lucide-react';
import { AreaSearch } from './AreaSearch';

/* ─────────────────────────── data ─────────────────────────── */

const SOURCES: ReadonlyArray<{
  name: string;
  url: string;
  logo?: string;
}> = [
  {
    name: 'Open-Meteo',
    url: 'https://open-meteo.com',
  },
  {
    name: 'BPBD DKI Jakarta',
    url: 'https://bpbd.jakarta.go.id',
    logo: '/assets/aistudio/image_3a852cc4.png',
  },
  {
    name: 'Satu Data Jakarta',
    url: 'https://satudata.jakarta.go.id',
    logo: '/assets/aistudio/image_1f84877c.png',
  },
  {
    name: 'Copernicus DEM (GLO-30)',
    url: 'https://registry.opendata.aws/copernicus-dem/',
    logo: '/assets/aistudio/image_ac2606e9.png',
  },
  {
    name: 'HDX COD-AB Indonesia',
    url: 'https://data.humdata.org/dataset/indonesia-administrative-boundary-polygons-lines-and-places',
    logo: '/assets/aistudio/image_60699540.png',
  },
  {
    name: 'OpenStreetMap',
    url: 'https://www.openstreetmap.org',
    logo: '/assets/aistudio/image_72744caf.png',
  },
];

const TIERS = [
  { name: 'Low', range: '< 0,8%', color: '#71A868' },
  { name: 'Medium', range: '0,8 – 2,15%', color: '#CE9F45' },
  { name: 'Medium-High', range: '2,15 – 3,3%', color: '#C9733F' },
  { name: 'High', range: '≥ 3,3%', color: '#B8514A' },
] as const;

const STEPS = [
  {
    num: '01',
    lead: 'Ambil',
    big: 'data.',
    desc: 'Sistem mengumpulkan hujan prakiraan dari Open-Meteo, tinggi muka air dari BPBD, dan elevasi tiap kecamatan dari Copernicus DEM secara otomatis setiap hari.',
  },
  {
    num: '02',
    lead: 'Hitung',
    big: 'peluang.',
    desc: 'Model regresi logistik yang dilatih dari data 2016–2020 menghitung peluang banjir untuk 44 kecamatan DKI Jakarta. Jika TMA tidak tersedia, dipakai model hujan-elevasi saja.',
  },
  {
    num: '03',
    lead: 'Beri',
    big: 'kategori.',
    desc: 'Peluang dikelompokkan menjadi empat warna (Low · Medium · Medium-High · High) berdasarkan ambang batas yang dikalibrasi dari data historis banjir.',
  },
  {
    num: '04',
    lead: 'Cari',
    big: 'rute alternatif.',
    desc: 'Pengguna dapat mencari rute yang memiliki risiko banjir rendah untuk bepergian dengan lebih aman.',
  },
] as const;

const STATS = [
  { value: '44 kecamatan', label: 'Dipantau di DKI Jakarta' },
  { value: '24 jam', label: 'Cakupan waktu prediksi' },
  { value: '5 tahun', label: 'Data latih (2016–2020)' },
  { value: '2 mode', label: 'Prediksi live & log histori' },
] as const;

const FEATURES = [
  {
    icon: MapPinned,
    title: 'Risiko Kecamatan',
    desc: 'Lihat peluang dan kategori risiko banjir tiap kecamatan di peta interaktif.',
  },
  {
    icon: Waves,
    title: 'Tinggi Muka Air',
    desc: 'Pantau data tinggi muka air dari BPBD sebagai salah satu masukan model.',
  },
  {
    icon: CloudRain,
    title: 'Forecast Hujan',
    desc: 'Cek prakiraan curah hujan yang bersumber dari Open-Meteo.',
  },
  {
    icon: Route,
    title: 'Rute Alternatif',
    desc: 'Cari rute dengan risiko banjir yang lebih rendah sebelum bepergian.',
  },
] as const;

const STACK = [
  'Next.js 15', 'TypeScript', 'Tailwind CSS', 'FastAPI', 'Python',
  'Scikit-learn', 'Qwen (Ollama)', 'Leaflet', 'Pandas', 'NumPy',
];

const NAV_LINKS = [
  { href: '#cara-kerja', label: 'Cara Kerja' },
  { href: '#mengapa', label: 'Mengapa Penting' },
  { href: '#sumber-data', label: 'Sumber Data' },
  { href: '#tentang', label: 'Tentang' },
];

/* ─────────────────────── component ─────────────────────────── */

const subscribeTheme = (onChange: () => void) => {
  window.addEventListener('storage', onChange);
  window.addEventListener('pawang-theme-change', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('pawang-theme-change', onChange);
  };
};
const getThemeSnapshot = () => {
  try {
    return localStorage.getItem('pawang-theme') !== 'light';
  } catch {
    return true;
  }
};
const getThemeServerSnapshot = () => true;

export const Landing: React.FC = () => {
  const isDark = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);
  const [menuOpen, setMenuOpen] = useState(false);

  /* sync dengan tema yang sudah disimpan di map */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleTheme = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('pawang-theme', next ? 'dark' : 'light');
      window.dispatchEvent(new Event('pawang-theme-change'));
    } catch { /* ignore */ }
  };

  const eyebrow =
    'mb-3 inline-block text-xs font-semibold uppercase tracking-[0.18em] text-[#1A73E8] dark:text-[#8AB4F8]';

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-white text-[#202124] dark:bg-[#202124] dark:text-[#E8EAED]">

      {/* ══════════════ HEADER ══════════════ */}
      <header className="sticky top-0 z-50 w-full border-b border-[#DADCE0] bg-white/95 backdrop-blur dark:border-[#3C4043] dark:bg-[#202124]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/pawang-logo.png"
              alt="Pawang AI Logo"
              width={40}
              height={40}
              className="rounded-full"
            />
            <span className="text-lg font-semibold tracking-tight">Pawang AI</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-[#5F6368] transition hover:text-[#1A73E8] dark:text-[#9AA0A6] dark:hover:text-[#8AB4F8]"
              >
                {l.label}
              </a>
            ))}
            <button
              onClick={toggleTheme}
              aria-label="Ganti tema"
              className="grid h-10 w-10 place-items-center rounded-full border border-[#DADCE0] text-[#5F6368] transition hover:bg-[#F8F9FA] dark:border-[#5F6368] dark:text-[#9AA0A6] dark:hover:bg-[#292A2D]"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link
              href="/map"
              className="rounded-full bg-[#1A73E8] px-6 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-[#1765CC] dark:bg-[#8AB4F8] dark:text-[#202124] dark:hover:bg-[#AECBFA]"
            >
              Buka Dashboard
            </Link>
          </nav>

          <button
            className="grid h-10 w-10 place-items-center rounded-full text-[#202124] md:hidden dark:text-[#E8EAED]"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Menu"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-[#DADCE0] bg-white px-6 py-5 md:hidden dark:border-[#3C4043] dark:bg-[#292A2D]">
            <ul className="space-y-4">
              {NAV_LINKS.map(l => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="block text-base font-medium text-[#202124] dark:text-[#E8EAED]"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <button
                  onClick={() => { toggleTheme(); setMenuOpen(false); }}
                  className="flex items-center gap-2 text-base font-medium text-[#5F6368] dark:text-[#9AA0A6]"
                >
                  {isDark ? <Sun size={18} /> : <Moon size={18} />}
                  {isDark ? 'Mode terang' : 'Mode gelap'}
                </button>
              </li>
            </ul>
            <Link
              href="/map"
              onClick={() => setMenuOpen(false)}
              className="mt-5 block rounded-full bg-[#1A73E8] py-3 text-center text-sm font-semibold text-white dark:bg-[#8AB4F8] dark:text-[#202124]"
            >
              Buka Dashboard
            </Link>
          </div>
        )}
      </header>

      {/* ══════════════ HERO ══════════════ */}
      <section className="bg-white dark:bg-[#202124]">
        <div className="w-full pt-14 sm:pt-20">
          {/* judul + logo */}
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-10 px-5 sm:px-8 md:flex-row md:items-center">
            <div className="max-w-4xl md:flex-1">
              <span className={eyebrow}>Pawang AI</span>
              <p className="text-2xl font-normal tracking-tight text-[#5F6368] sm:text-4xl dark:text-[#9AA0A6]">
                software untuk
              </p>
              <h1 className="mt-1 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl lg:text-[88px]">
                prediksi banjir<br />
                <span className="text-[#1A73E8] dark:text-[#8AB4F8]">hari ini</span>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-relaxed text-[#5F6368] sm:text-lg dark:text-[#9AA0A6]">
                Cek peluang banjir per kecamatan di Jakarta lewat peta interaktif berbasis data curah hujan, tinggi muka air sungai, dan elevasi wilayah.
              </p>
            </div>
            <div className="flex items-center justify-center md:w-[34%] md:shrink-0">
              <Image
                src="/pawang-logo.png"
                alt="Pawang AI"
                width={420}
                height={420}
                priority
                className="h-auto w-48 rounded-full sm:w-64 md:w-full md:max-w-[380px]"
              />
            </div>
          </div>

          {/* kartu pencarian */}
          <div className="mt-10 w-full border-t border-[#DADCE0] bg-white py-5 sm:py-6 dark:border-[#3C4043] dark:bg-[#292A2D]">
            <div className="mx-auto max-w-6xl px-5 sm:px-8">
              <p className="mb-3 text-sm font-semibold">Cari kecamatan Anda</p>
              <AreaSearch />
              <div className="my-4 flex items-center gap-3 text-xs text-[#5F6368] dark:text-[#9AA0A6]">
                <span className="h-px flex-1 bg-[#DADCE0] dark:bg-[#3C4043]" />
                atau
                <span className="h-px flex-1 bg-[#DADCE0] dark:bg-[#3C4043]" />
              </div>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#1A73E8] hover:underline dark:text-[#8AB4F8]"
                >
                  <MapPinned size={16} aria-hidden /> Pilih langsung di peta
                </Link>
              </div>
            </div>
          </div>

          {/* foto (tanpa gradient) */}
          <div className="w-full">
            <div className="relative h-64 w-full overflow-hidden sm:h-80 md:h-[460px]">
              <Image
                src="/jakarta-flood.jpg"
                alt="Banjir Jakarta"
                fill
                priority
                sizes="100vw"
                className="object-cover object-center"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ STATS ══════════════ */}
      <section className="border-y border-[#DADCE0] bg-[#F8F9FA] py-14 dark:border-[#3C4043] dark:bg-[#292A2D]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-6 sm:px-8 md:flex md:items-start md:justify-between md:gap-x-8">
          {STATS.map(s => (
            <div key={s.label} className="text-center">
              <p className="whitespace-nowrap text-xl font-semibold tracking-tight text-[#1A73E8] sm:text-3xl md:text-2xl lg:text-3xl xl:text-4xl dark:text-[#8AB4F8]">
                {s.value}
              </p>
              <p className="mx-auto mt-2 text-sm leading-snug text-[#5F6368] dark:text-[#9AA0A6]">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════ CARA KERJA ══════════════ */}
      <section id="cara-kerja" className="bg-white px-5 py-24 sm:px-8 md:py-32 dark:bg-[#202124]">
        <div className="mx-auto max-w-6xl">
          <span className={eyebrow}>Pipeline</span>
          <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Bagaimana Pawang AI bekerja?
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
            Dari pengambilan data mentah hingga pencarian rute yang lebih aman, Pawang AI
            membantu warga memahami risiko banjir sebelum bepergian.
          </p>

          <ol className="mt-16 divide-y divide-[#DADCE0] border-y border-[#DADCE0] dark:divide-[#3C4043] dark:border-[#3C4043]">
            {STEPS.map(s => (
              <li
                key={s.num}
                className="grid gap-6 py-10 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-16 md:py-14"
              >
                <div>
                  <span className="text-sm font-semibold text-[#1A73E8] dark:text-[#8AB4F8]">
                    Langkah {s.num}
                  </span>
                  <p className="mt-2 text-2xl text-[#5F6368] sm:text-4xl dark:text-[#9AA0A6]">{s.lead}</p>
                  <h3 className="text-5xl font-semibold leading-none tracking-tight sm:text-7xl">
                    {s.big}
                  </h3>
                </div>
                <p className="max-w-lg text-base leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
                  {s.desc}
                </p>
              </li>
            ))}
          </ol>

          {/* kategori */}
          <div className="mt-16 rounded-3xl bg-[#F8F9FA] p-6 sm:p-10 dark:bg-[#292A2D]">
            <h3 className="text-center text-xl font-semibold sm:text-2xl">Kategori risiko &amp; ambang batas peluang</h3>
            <ul className="mt-6 grid grid-cols-2 overflow-hidden rounded-2xl md:grid-cols-4">
              {TIERS.map(t => (
                <li
                  key={t.name}
                  className="flex min-h-[120px] flex-col justify-between p-5 text-white sm:min-h-[136px] sm:p-6"
                  style={{ backgroundColor: t.color }}
                >
                  <span className="text-lg font-semibold leading-tight tracking-tight sm:text-xl">
                    {t.name}
                  </span>
                  <span className="text-lg font-semibold tracking-tight sm:text-xl">
                    {t.range}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-2xl bg-[#FEF7E0] p-4 text-sm leading-relaxed text-[#7A4F01] dark:bg-[#F9AB00]/10 dark:text-[#FDD663]">
              <p className="text-justify">
                Angka persentase tersebut tergolong kecil karena kejadian banjir harian di tingkat
                kecamatan terbilang jarang terjadi dalam rekam jejak data historis 2016–2020 (hanya
                sekitar 2–3% dari total hari). Ambang batas kategori ini kemudian dikalibrasi
                secara statistik dari hasil evaluasi tahunan agar sistem tetap peka mendeteksi
                potensi banjir tanpa memicu terlalu banyak peringatan palsu.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ MENGAPA PENTING ══════════════ */}
      <section id="mengapa" className="bg-[#F8F9FA] px-5 py-24 sm:px-8 md:py-32 dark:bg-[#292A2D]">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-6">
            <div>
              <span className={eyebrow}>Mengapa penting?</span>
              <p className="text-2xl text-[#5F6368] sm:text-5xl dark:text-[#9AA0A6]">Jakarta banjir</p>
              <h2 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl lg:text-[104px]">
                setiap tahun
              </h2>
            </div>
            <Clock
              aria-hidden
              className="-mt-1 h-[96px] w-[96px] shrink-0 text-[#1A73E8] opacity-50 sm:-mt-3 sm:h-[150px] sm:w-[150px] md:h-[185px] md:w-[185px] dark:text-[#8AB4F8]"
            />
          </div>
          <div className="mt-12 grid gap-6 md:mt-14 md:grid-cols-2 md:gap-12">
            <p className="max-w-lg text-base leading-relaxed text-[#5F6368] sm:text-lg dark:text-[#9AA0A6]">
              Risiko banjir per wilayah sering terlambat diketahui warga. Pawang AI menerjemahkan
              prakiraan hujan dan tinggi muka air menjadi peta risiko harian yang mudah dibaca.
            </p>
            <p className="max-w-lg text-base leading-relaxed text-[#5F6368] sm:text-lg dark:text-[#9AA0A6]">
              Berbasis 5 tahun data historis DKI Jakarta, siapa pun bisa mengecek potensi banjir
              lebih awal sebelum beraktivitas—gratis, cepat, dan transparan.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════ SUMBER DATA ══════════════ */}
      <section id="sumber-data" className="bg-white px-5 py-24 text-black sm:px-8 md:py-32">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-4xl font-semibold tracking-tight text-black sm:text-5xl">
            Sumber data
          </h2>

          <div className="mx-auto mt-14 grid max-w-5xl grid-cols-2 place-items-center gap-x-6 gap-y-12 md:grid-cols-12">
            {SOURCES.map((s, idx) => {
              const colClass =
                idx < 4
                  ? 'md:col-span-3'
                  : idx === 4
                    ? 'md:col-span-3 md:col-start-4'
                    : 'md:col-span-3 md:col-start-7';
              return (
                <a
                  key={s.name}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  title={s.name}
                  className={`${colClass} flex items-center justify-center rounded-xl transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]`}
                >
                  {s.logo ? (
                    <div className="relative h-24 w-40 sm:h-28 sm:w-48">
                      <Image
                        src={s.logo}
                        alt={s.name}
                        fill
                        sizes="(min-width: 640px) 192px, 160px"
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-24 w-40 flex-col items-center justify-center gap-1 text-black sm:h-28 sm:w-48">
                      <CloudSun size={52} strokeWidth={1.75} className="text-black" aria-hidden />
                      <span className="text-xl font-semibold tracking-tight text-black">
                        OpenMeteo
                      </span>
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      </section>

                  {/* ══════════════ TENTANG ══════════════ */}
      <section id="tentang" className="bg-[#F8F9FA] py-24 md:py-32 dark:bg-[#292A2D]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">

          {/* judul (center) */}
          <div className="text-center">
            <span className={eyebrow}>Tentang proyek</span>
            <h2 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Apa itu Pawang AI?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-center text-base leading-relaxed text-[#5F6368] sm:text-lg dark:text-[#9AA0A6]">
            Pawang AI adalah software berbasis model prediksi peluang banjir per kecamatan di DKI Jakarta.
          </p>
          </div>

          {/* kartu klarifikasi (center) */}
          <div className="mx-auto mt-12 max-w-2xl rounded-3xl border border-[#DADCE0] bg-white p-7 text-center dark:border-[#3C4043] dark:bg-[#202124]">
            <h3 className="text-xl font-semibold">Prediksi, bukan forecasting</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
              Model kami hanya memprediksi peluang banjir dari model data. Kami tidak
              membuat prakiraan cuaca sendiri. Forecast hujan diambil dari Open-Meteo
              dan selalu pantau informasi dari BPBD, BMKG, dan media sosial terkait
              mengenai informasi banjir yang lebih lengkap.
            </p>
          </div>

          {/* kolom fitur (center) */}
          <h3 className="mt-20 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#5F6368] dark:text-[#9AA0A6]">
            Fitur
          </h3>
          <ul className="mt-6 grid gap-10 text-center sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(f => (
              <li key={f.title} className="flex flex-col items-center">
                <f.icon size={24} aria-hidden className="text-[#1A73E8] dark:text-[#8AB4F8]" />
                <h4 className="mt-4 text-lg font-semibold">{f.title}</h4>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
                  {f.desc}
                </p>
              </li>
            ))}
          </ul>

          {/* stack teknologi (center) */}
          <div className="mt-16 border-t border-[#DADCE0] pt-8 text-center dark:border-[#3C4043]">
            <h3 className="text-sm font-semibold">Stack teknologi</h3>
            <ul className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-[#5F6368] dark:text-[#9AA0A6]">
              {STACK.map(t => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="border-t border-[#DADCE0] bg-[#F8F9FA] px-5 py-10 sm:px-8 dark:border-[#3C4043] dark:bg-[#292A2D]">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center md:flex-row md:justify-between md:text-left">
          <div className="flex items-center gap-3">
            <Image src="/pawang-logo.png" alt="Logo" width={28} height={28} className="rounded-full" />
            <span className="text-sm font-semibold">Pawang AI</span>
          </div>
          <p className="text-xs text-[#5F6368] dark:text-[#9AA0A6]">
            Proyek Software Engineering - Kelompok 1
          </p>
        </div>
      </footer>
    </div>
  );
};