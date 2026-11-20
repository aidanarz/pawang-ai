'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  MapPinned,
  ExternalLink,
  Cpu,
  ShieldCheck,
  Map as MapIcon,
  Menu,
  X,
  Sun,
  Moon,
  AlertTriangle,
} from 'lucide-react';
import { AreaSearch } from './AreaSearch';
import { RISK_COLORS } from '@/utils/areaColors';

/* ─────────────────────────── data ─────────────────────────── */

const SOURCES = [
  {
    name: 'Open-Meteo',
    use: 'Prakiraan hujan hari prakiraan, hujan beberapa hari terakhir, dan peluang hujan.',
    url: 'https://open-meteo.com',
  },
  {
    name: 'BPBD DKI Jakarta',
    use: 'Tinggi muka air sungai dan pintu air, diambil langsung dari halaman resminya.',
    url: 'https://bpbd.jakarta.go.id',
  },
  {
    name: 'Satu Data Jakarta',
    use: 'Riwayat tinggi muka air dan data kejadian banjir DKI untuk melatih model.',
    url: 'https://satudata.jakarta.go.id',
  },
  {
    name: 'Copernicus DEM (GLO-30)',
    use: 'Elevasi tiap kecamatan, diambil dari AWS Open Data.',
    url: 'https://registry.opendata.aws/copernicus-dem/',
  },
  {
    name: 'HDX COD-AB Indonesia',
    use: 'Batas wilayah kecamatan DKI Jakarta.',
    url: 'https://data.humdata.org/dataset/indonesia-administrative-boundary-polygons-lines-and-places',
  },
  {
    name: 'OpenStreetMap',
    use: 'Peta dasar interaktif.',
    url: 'https://www.openstreetmap.org',
  },
] as const;

const TIERS = [
  { name: 'Low', range: '< 0,8%', color: RISK_COLORS.Low },
  { name: 'Medium', range: '0,8 – 2,15%', color: RISK_COLORS.Medium },
  { name: 'Medium-High', range: '2,15 – 3,3%', color: RISK_COLORS['Medium-High'] },
  { name: 'High', range: '≥ 3,3%', color: RISK_COLORS.High },
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
    lead: 'Tulis',
    big: 'saran.',
    desc: 'Agen AI (Qwen via Ollama) menyusun saran singkat per kecamatan dengan pagar aturan ketat—tidak boleh mengarang angka atau klaim kepastian. Bila gagal, dipakai teks saran baku.',
  },
] as const;

const STATS = [
  { value: '44', label: 'Kecamatan dipantau' },
  { value: '0,884', label: 'ROC-AUC model penuh' },
  { value: '5', label: 'Tahun data latih (2016–2020)' },
  { value: '62+', label: 'Automated tests' },
] as const;

const ABOUT = [
  {
    icon: Cpu,
    tint: 'bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]',
    title: 'Model ML',
    desc: 'Regresi logistik terregularisasi yang dilatih dari 5 tahun data historis banjir DKI. Dua varian: full (dengan TMA) dan rainfall_only (tanpa TMA). Mode auto memilih model terbaik sesuai ketersediaan data.',
  },
  {
    icon: ShieldCheck,
    tint: 'bg-[#E6F4EA] text-[#188038] dark:bg-[#34A853]/20 dark:text-[#81C995]',
    title: 'Agen AI Berguardrail',
    desc: 'LLM Qwen (self-hosted via Ollama) hanya menulis teks naratif—tidak pernah menghitung angka. Semua output difilter pagar aturan ketat; bila melanggar, sistem jatuh ke teks saran deterministik yang aman.',
  },
  {
    icon: MapIcon,
    tint: 'bg-[#FEF7E0] text-[#B06000] dark:bg-[#F9AB00]/20 dark:text-[#FDD663]',
    title: 'Dashboard Interaktif',
    desc: 'Peta choropleth berbasis Leaflet menampilkan warna risiko tiap kecamatan. Klik kecamatan untuk melihat peluang, prakiraan hujan, tinggi muka air, dan saran. Warga juga bisa melaporkan kondisi lapangan.',
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
                <span className="text-[#1A73E8] dark:text-[#8AB4F8]">hari ini.</span>
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
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-6 sm:px-8 md:grid-cols-4">
          {STATS.map(s => (
            <div key={s.label}>
              <p className="text-5xl font-semibold tracking-tight text-[#1A73E8] sm:text-6xl dark:text-[#8AB4F8]">
                {s.value}
              </p>
              <p className="mt-2 max-w-[14rem] text-sm leading-snug text-[#5F6368] dark:text-[#9AA0A6]">
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
            Dari pengambilan data mentah hingga saran yang bisa dibaca warga—semua berjalan
            otomatis setiap hari tanpa campur tangan manual.
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
            <h3 className="text-xl font-semibold sm:text-2xl">Kategori risiko &amp; ambang batas peluang</h3>
            <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {TIERS.map(t => (
                <li
                  key={t.name}
                  className="flex items-center gap-3 rounded-full border border-[#DADCE0] bg-white px-4 py-3 dark:border-[#3C4043] dark:bg-[#202124]"
                >
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-sm leading-tight">
                    <b className="block font-semibold">{t.name}</b>
                    <span className="text-[#5F6368] dark:text-[#9AA0A6]">{t.range}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3 rounded-2xl bg-[#FEF7E0] p-4 text-sm leading-relaxed text-[#7A4F01] dark:bg-[#F9AB00]/10 dark:text-[#FDD663]">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
              <p className="max-w-prose">
                <b>Catatan penting:</b> Ini adalah perkiraan, bukan kepastian. Pada evaluasi data
                2020, model menangkap sekitar separuh kejadian banjir berkategori High, dan hanya
                ≈1 dari 6 peringatan High yang benar-benar banjir. Selalu cek info resmi BPBD DKI.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ MENGAPA PENTING ══════════════ */}
      <section id="mengapa" className="bg-[#F8F9FA] px-5 py-24 sm:px-8 md:py-32 dark:bg-[#292A2D]">
        <div className="mx-auto max-w-6xl">
          <span className={eyebrow}>Mengapa penting?</span>
          <p className="text-2xl text-[#5F6368] sm:text-5xl dark:text-[#9AA0A6]">Jakarta banjir</p>
          <h2 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl lg:text-[104px]">
            setiap tahun.
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-2 md:gap-16">
            <p className="max-w-lg text-base leading-relaxed text-[#5F6368] sm:text-lg dark:text-[#9AA0A6]">
              Banjir bukan sekadar genangan—ia menghentikan mobilitas, merusak harta benda, dan
              membahayakan nyawa. Namun informasi risiko per wilayah sering kali terlambat
              sampai ke warga. Pawang AI hadir sebagai jembatan antara data teknis cuaca dan
              kebutuhan warga akan informasi yang mudah dipahami, satu hari lebih awal.
            </p>
            <p className="max-w-lg text-base leading-relaxed text-[#5F6368] sm:text-lg dark:text-[#9AA0A6]">
              Dengan menggabungkan prakiraan cuaca, sensor tinggi muka air, dan model statistik
              berbasis 5 tahun data historis, sistem ini menyediakan peta risiko harian yang
              bisa diakses publik—gratis, transparan, dan terbuka.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════ SUMBER DATA ══════════════ */}
      <section id="sumber-data" className="bg-white px-5 py-24 sm:px-8 md:py-32 dark:bg-[#202124]">
        <div className="mx-auto max-w-6xl">
          <span className={eyebrow}>Transparansi</span>
          <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl">Sumber data</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
            Semua sumber bersifat terbuka dan dapat diverifikasi siapa saja.
          </p>

          <div className="mt-10 overflow-x-auto rounded-3xl border border-[#DADCE0] dark:border-[#3C4043]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="bg-[#F8F9FA] text-xs font-semibold uppercase tracking-wider text-[#5F6368] dark:bg-[#292A2D] dark:text-[#9AA0A6]">
                  <th className="px-6 py-4">Sumber</th>
                  <th className="px-6 py-4">Kegunaan dalam sistem</th>
                  <th className="px-6 py-4">Tautan</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map(s => (
                  <tr key={s.name} className="border-t border-[#DADCE0] dark:border-[#3C4043]">
                    <td className="px-6 py-4 font-semibold">{s.name}</td>
                    <td className="px-6 py-4 text-[#5F6368] dark:text-[#9AA0A6]">{s.use}</td>
                    <td className="px-6 py-4">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[#1A73E8] hover:underline dark:text-[#8AB4F8]"
                      >
                        Kunjungi <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══════════════ TENTANG ══════════════ */}
      <section id="tentang" className="bg-[#F8F9FA] px-5 py-24 sm:px-8 md:py-32 dark:bg-[#292A2D]">
        <div className="mx-auto max-w-6xl">
          <span className={eyebrow}>Tentang proyek</span>
          <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl">Apa itu Pawang AI?</h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {ABOUT.map(a => (
              <div
                key={a.title}
                className="rounded-3xl border border-[#DADCE0] bg-white p-7 dark:border-[#3C4043] dark:bg-[#202124]"
              >
                <div className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ${a.tint}`}>
                  <a.icon size={24} aria-hidden />
                </div>
                <h3 className="text-lg font-semibold">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">{a.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-3xl border border-[#DADCE0] bg-white p-7 dark:border-[#3C4043] dark:bg-[#202124]">
            <h3 className="mb-4 text-sm font-semibold">Stack teknologi</h3>
            <div className="flex flex-wrap gap-2">
              {STACK.map(t => (
                <span
                  key={t}
                  className="rounded-full bg-[#E8F0FE] px-4 py-1.5 text-xs font-semibold text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]"
                >
                  {t}
                </span>
              ))}
            </div>
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
          <p className="max-w-md text-xs leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
            Proyek prediksi banjir Jakarta — Kelompok 1, Teknik Sistem Komputer &amp; Informasi,
            Fakultas Teknik Universitas Indonesia
          </p>
          <p className="text-xs text-[#5F6368] dark:text-[#9AA0A6]">
            Data prediksi bukan pengganti informasi resmi BPBD.
          </p>
        </div>
      </footer>
    </div>
  );
};