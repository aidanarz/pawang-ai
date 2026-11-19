'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPinned, ChevronDown, ExternalLink } from 'lucide-react';
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
    title: 'Ambil Data',
    desc: 'Sistem mengumpulkan hujan prakiraan dari Open-Meteo, tinggi muka air dari BPBD, dan elevasi tiap kecamatan dari Copernicus DEM secara otomatis setiap hari.',
  },
  {
    num: '02',
    title: 'Hitung Peluang',
    desc: 'Model regresi logistik yang dilatih dari data 2016–2020 menghitung peluang banjir untuk 44 kecamatan DKI Jakarta. Jika TMA tidak tersedia, dipakai model hujan-elevasi saja.',
  },
  {
    num: '03',
    title: 'Beri Kategori',
    desc: 'Peluang dikategorikan menjadi empat warna (Low · Medium · Medium-High · High) berdasarkan ambang batas yang dikalibrasi dari data historis banjir.',
  },
  {
    num: '04',
    title: 'Tulis Saran',
    desc: 'Agen AI (Qwen via Ollama) menyusun saran singkat per kecamatan dengan pagar aturan ketat—tidak boleh mengarang angka atau klaim kepastian. Bila gagal, dipakai teks saran baku.',
  },
] as const;

const STATS = [
  { value: '44', label: 'Kecamatan dipantau' },
  { value: '0,884', label: 'ROC-AUC model penuh' },
  { value: '5', label: 'Tahun data latih (2016–2020)' },
  { value: '62+', label: 'Automated tests' },
] as const;

/* ─────────────────────── component ─────────────────────────── */

export const Landing: React.FC = () => {
  const [isDark, setIsDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  /* sync dengan tema yang sudah disimpan di map */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pawang-theme');
      const dark = saved !== 'light';
      setIsDark(dark);
      document.documentElement.classList.toggle('dark', dark);
    } catch {
      /* keep default dark */
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('pawang-theme', next ? 'dark' : 'light');
    } catch { /* ignore */ }
  };

  /* ── nav helpers ── */
  const NAV_LINKS = [
    { href: '#cara-kerja', label: 'Cara Kerja' },
    { href: '#sumber-data', label: 'Sumber Data' },
    { href: '#tentang', label: 'Tentang' },
  ];

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#FFF9D2] text-[#010736] dark:bg-[#010736] dark:text-[#FCF1D0]">

      {/* ══════════════════════════════════════════
          STICKY HEADER
      ══════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 w-full border-b border-[#22396F]/30 bg-[#010736] shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">

          {/* Logo + wordmark */}
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/pawang-logo.png"
              alt="Pawang AI Logo"
              width={40}
              height={40}
              className="rounded-full"
            />
            <span className="text-lg font-extrabold tracking-tight text-[#FCF1D0]">
              Pawang AI
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-[#BFDDF0] transition hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <button
              onClick={toggleTheme}
              aria-label="Ganti tema"
              className="rounded-full border border-[#22396F] bg-[#0D1C42] px-3 py-1.5 text-xs font-semibold text-[#FCF1D0] transition hover:bg-[#22396F]"
            >
              {isDark ? '☀ Light' : '🌙 Dark'}
            </button>
            <Link
              href="/map"
              className="rounded-full bg-[#8CC0EB] px-5 py-2 text-sm font-bold text-[#010736] shadow transition hover:brightness-110"
            >
              Buka Dashboard →
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="flex flex-col gap-1.5 p-2 md:hidden"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Menu"
          >
            <span className="block h-0.5 w-6 bg-[#FCF1D0]" />
            <span className="block h-0.5 w-6 bg-[#FCF1D0]" />
            <span className="block h-0.5 w-6 bg-[#FCF1D0]" />
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="border-t border-[#22396F]/40 bg-[#0D1C42] px-6 py-4 md:hidden">
            <ul className="space-y-3">
              {NAV_LINKS.map(l => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm font-medium text-[#BFDDF0] hover:text-white"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <button
                  onClick={() => { toggleTheme(); setMenuOpen(false); }}
                  className="text-sm font-medium text-[#BFDDF0] hover:text-white"
                >
                  {isDark ? '☀ Light mode' : '🌙 Dark mode'}
                </button>
              </li>
            </ul>
            <Link
              href="/map"
              onClick={() => setMenuOpen(false)}
              className="mt-4 block rounded-full bg-[#8CC0EB] py-2 text-center text-sm font-bold text-[#010736]"
            >
              Buka Dashboard →
            </Link>
          </div>
        )}
      </header>

      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section className="relative min-h-[85vh] overflow-hidden bg-[#010736]">
        {/* flood photo */}
        <Image
          src="/jakarta-flood.jpg"
          alt="Banjir Jakarta"
          fill
          className="object-cover object-center opacity-30"
          priority
        />
        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#010736]/60 via-[#010736]/40 to-[#010736]" />

        {/* hero content */}
        <div className="relative z-10 mx-auto flex min-h-[85vh] max-w-6xl flex-col justify-center px-6 py-24 sm:px-12">
          <div className="max-w-2xl">
            {/* eyebrow */}
            <span className="mb-4 inline-block rounded-full border border-[#8CC0EB]/60 bg-[#0D1C42]/80 px-4 py-1 text-xs font-semibold tracking-widest text-[#8CC0EB] uppercase">
              Prediksi Banjir Jakarta
            </span>

            {/* headline */}
            <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
              Pantau Risiko Banjir&nbsp;
              <span className="text-[#8CC0EB]">44 Kecamatan</span>
              <br />Jakarta Hari Ini
            </h1>

            {/* sub */}
            <p className="mb-10 text-justify text-base leading-relaxed text-[#BFDDF0] sm:text-lg">
              Pawang AI menggabungkan prakiraan hujan, tinggi muka air sungai, dan elevasi
              wilayah untuk menghitung peluang banjir setiap hari—disajikan lewat peta
              interaktif yang bisa dicek siapa saja, kapan saja.
            </p>

            {/* CTA */}
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href="/map"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#8CC0EB] px-8 py-4 text-base font-bold text-[#010736] shadow-lg transition hover:brightness-110"
              >
                <MapPinned size={18} /> Buka Dashboard Peta
              </Link>
              <a
                href="#cara-kerja"
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#8CC0EB] px-8 py-4 text-base font-semibold text-[#8CC0EB] transition hover:bg-[#8CC0EB]/10"
              >
                Pelajari Cara Kerja <ChevronDown size={16} />
              </a>
            </div>
          </div>
        </div>

        {/* scroll hint */}
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 animate-bounce text-[#8CC0EB]">
          <ChevronDown size={28} />
        </div>
      </section>

      {/* ══════════════════════════════════════════
          QUICK SEARCH / CTA BAR
      ══════════════════════════════════════════ */}
      <section className="bg-[#FFEBCC] px-4 py-8 dark:bg-[#0D1C42]">
        <div className="mx-auto max-w-2xl space-y-3">
          <p className="text-center text-sm font-semibold text-[#010736] dark:text-[#FCF1D0]">
            Cari kecamatan langsung:
          </p>
          <AreaSearch />
          <div className="flex items-center gap-3 text-xs text-[#22396F] dark:text-[#BFDDF0]">
            <span className="h-px flex-1 bg-current opacity-30" />atau<span className="h-px flex-1 bg-current opacity-30" />
          </div>
          <Link
            href="/map"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#22396F] bg-[#8CC0EB] px-4 py-2.5 text-sm font-bold text-[#010736] shadow-md hover:brightness-105 dark:bg-[#22396F] dark:text-[#FCF1D0]"
          >
            <MapPinned size={16} aria-hidden /> Pilih langsung di peta
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════════ */}
      <section className="border-y border-[#22396F]/20 bg-[#010736] py-10">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 sm:grid-cols-4">
          {STATS.map(s => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold text-[#8CC0EB] sm:text-4xl">{s.value}</p>
              <p className="mt-1 text-xs leading-snug text-[#BFDDF0]">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CARA KERJA
      ══════════════════════════════════════════ */}
      <section id="cara-kerja" className="px-4 py-20 dark:bg-[#010736]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="mb-2 inline-block text-xs font-bold tracking-widest text-[#8CC0EB] uppercase">Pipeline</span>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Bagaimana Pawang AI Bekerja?</h2>
            <p className="mx-auto mt-3 max-w-xl text-justify text-sm leading-relaxed text-[#0D1C42] dark:text-[#BFDDF0]">
              Dari pengambilan data mentah hingga saran yang bisa dibaca warga—semua berjalan
              otomatis setiap hari tanpa campur tangan manual.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(s => (
              <div
                key={s.num}
                className="rounded-2xl border border-[#22396F]/40 bg-white/70 p-6 shadow-sm dark:bg-[#0D1C42]/80"
              >
                <span className="mb-3 block text-5xl font-black text-[#22396F]/20 dark:text-[#8CC0EB]/20">
                  {s.num}
                </span>
                <h3 className="mb-2 text-base font-extrabold text-[#010736] dark:text-[#FCF1D0]">{s.title}</h3>
                <p className="text-justify text-xs leading-relaxed text-[#0D1C42] dark:text-[#BFDDF0]">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* kategori warna */}
          <div className="mt-10 rounded-2xl border border-[#22396F]/40 bg-white/70 p-6 dark:bg-[#0D1C42]/80">
            <h3 className="mb-4 text-sm font-extrabold text-[#010736] dark:text-[#FCF1D0]">
              Kategori Risiko &amp; Ambang Batas Peluang
            </h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TIERS.map(t => (
                <li
                  key={t.name}
                  className="flex items-center gap-3 rounded-xl border border-[#22396F]/30 px-3 py-2.5"
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="text-xs">
                    <b className="block text-[#010736] dark:text-[#FCF1D0]">{t.name}</b>
                    <span className="text-[#0D1C42] dark:text-[#BFDDF0]">{t.range}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-justify text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <b>Catatan penting:</b> Ini adalah perkiraan, bukan kepastian. Pada evaluasi data
              2020, model menangkap sekitar separuh kejadian banjir berkategori High, dan hanya
              ≈1 dari 6 peringatan High yang benar-benar banjir. Selalu cek info resmi BPBD DKI.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          HERO SPLIT — foto + teks
      ══════════════════════════════════════════ */}
      <section className="bg-[#FFEBCC] dark:bg-[#0D1C42]">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-16 md:flex-row md:gap-16">
          {/* foto */}
          <div className="relative h-64 w-full overflow-hidden rounded-2xl shadow-xl md:h-80 md:w-1/2 md:shrink-0">
            <Image
              src="/jakarta-flood.jpg"
              alt="Banjir Jakarta"
              fill
              className="object-cover object-center"
            />
          </div>
          {/* teks */}
          <div className="flex-1">
            <span className="mb-2 inline-block text-xs font-bold tracking-widest text-[#22396F] dark:text-[#8CC0EB] uppercase">
              Mengapa penting?
            </span>
            <h2 className="mb-4 text-2xl font-extrabold leading-snug tracking-tight text-[#010736] dark:text-[#FCF1D0] sm:text-3xl">
              Jakarta Banjir Setiap Tahun—<br />Warga Butuh Informasi Dini
            </h2>
            <p className="text-justify text-sm leading-relaxed text-[#0D1C42] dark:text-[#BFDDF0]">
              Banjir bukan sekadar genangan—ia menghentikan mobilitas, merusak harta benda, dan
              membahayakan nyawa. Namun informasi risiko per wilayah sering kali terlambat
              sampai ke warga. Pawang AI hadir sebagai jembatan antara data teknis cuaca dan
              kebutuhan warga akan informasi yang mudah dipahami, satu hari lebih awal.
            </p>
            <p className="mt-3 text-justify text-sm leading-relaxed text-[#0D1C42] dark:text-[#BFDDF0]">
              Dengan menggabungkan prakiraan cuaca, sensor tinggi muka air, dan model statistik
              berbasis 5 tahun data historis, sistem ini menyediakan peta risiko harian yang
              bisa diakses publik—gratis, transparan, dan terbuka.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          SUMBER DATA
      ══════════════════════════════════════════ */}
      <section id="sumber-data" className="px-4 py-20 dark:bg-[#010736]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <span className="mb-2 inline-block text-xs font-bold tracking-widest text-[#8CC0EB] uppercase">Transparansi</span>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Sumber Data</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#0D1C42] dark:text-[#BFDDF0]">
              Semua sumber bersifat terbuka dan dapat diverifikasi siapa saja.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#22396F]/40 bg-white/70 dark:bg-[#0D1C42]/80">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#22396F]/30 bg-[#010736] text-left text-xs font-semibold text-[#FCF1D0]">
                  <th className="px-5 py-3">Sumber</th>
                  <th className="px-5 py-3">Kegunaan dalam Sistem</th>
                  <th className="px-5 py-3">Tautan</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((s, i) => (
                  <tr
                    key={s.name}
                    className={`border-b border-[#22396F]/20 ${i % 2 === 1 ? 'bg-[#BFDDF0]/20 dark:bg-[#22396F]/10' : ''}`}
                  >
                    <td className="px-5 py-3 font-bold text-[#010736] dark:text-[#FCF1D0]">{s.name}</td>
                    <td className="px-5 py-3 text-justify text-[#0D1C42] dark:text-[#BFDDF0]">{s.use}</td>
                    <td className="px-5 py-3">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#22396F] underline underline-offset-2 hover:text-[#010736] dark:text-[#8CC0EB] dark:hover:text-white"
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

      {/* ══════════════════════════════════════════
          TENTANG
      ══════════════════════════════════════════ */}
      <section id="tentang" className="bg-[#FFEBCC] px-4 py-20 dark:bg-[#0D1C42]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <span className="mb-2 inline-block text-xs font-bold tracking-widest text-[#22396F] dark:text-[#8CC0EB] uppercase">Tentang Proyek</span>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Apa Itu Pawang AI?</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-[#22396F]/40 bg-white/60 p-6 dark:bg-[#010736]/60">
              <div className="mb-3 text-3xl">🤖</div>
              <h3 className="mb-2 text-base font-extrabold text-[#010736] dark:text-[#FCF1D0]">Model ML</h3>
              <p className="text-justify text-xs leading-relaxed text-[#0D1C42] dark:text-[#BFDDF0]">
                Menggunakan regresi logistik terregularisasi yang dilatih dari 5 tahun data
                historis banjir DKI. Dua varian model: <em>full</em> (dengan TMA) dan
                <em>rainfall_only</em> (tanpa TMA). Mode <em>auto</em> memilih model terbaik
                berdasarkan ketersediaan data.
              </p>
            </div>
            <div className="rounded-2xl border border-[#22396F]/40 bg-white/60 p-6 dark:bg-[#010736]/60">
              <div className="mb-3 text-3xl">🛡️</div>
              <h3 className="mb-2 text-base font-extrabold text-[#010736] dark:text-[#FCF1D0]">Agen AI Berguardrail</h3>
              <p className="text-justify text-xs leading-relaxed text-[#0D1C42] dark:text-[#BFDDF0]">
                LLM Qwen (self-hosted via Ollama) hanya menulis teks naratif—tidak pernah
                menghitung angka. Semua output difilter oleh pagar aturan ketat; bila
                melanggar, sistem jatuh ke teks saran deterministik yang aman.
              </p>
            </div>
            <div className="rounded-2xl border border-[#22396F]/40 bg-white/60 p-6 dark:bg-[#010736]/60">
              <div className="mb-3 text-3xl">🗺️</div>
              <h3 className="mb-2 text-base font-extrabold text-[#010736] dark:text-[#FCF1D0]">Dashboard Interaktif</h3>
              <p className="text-justify text-xs leading-relaxed text-[#0D1C42] dark:text-[#BFDDF0]">
                Peta choropleth berbasis Leaflet menampilkan warna risiko tiap kecamatan.
                Klik kecamatan untuk melihat peluang, prakiraan hujan, tinggi muka air,
                dan saran. Warga juga bisa melaporkan kondisi lapangan secara langsung.
              </p>
            </div>
          </div>

          {/* tech stack */}
          <div className="mt-8 rounded-2xl border border-[#22396F]/40 bg-white/60 p-6 dark:bg-[#010736]/60">
            <h3 className="mb-4 text-sm font-extrabold text-[#010736] dark:text-[#FCF1D0]">Stack Teknologi</h3>
            <div className="flex flex-wrap gap-2">
              {[
                'Next.js 15', 'TypeScript', 'Tailwind CSS', 'FastAPI', 'Python',
                'Scikit-learn', 'Qwen (Ollama)', 'Leaflet', 'Pandas', 'NumPy',
              ].map(t => (
                <span
                  key={t}
                  className="rounded-full border border-[#22396F]/40 bg-[#BFDDF0]/40 px-3 py-1 text-xs font-semibold text-[#010736] dark:bg-[#22396F]/30 dark:text-[#FCF1D0]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FINAL CTA BAND
      ══════════════════════════════════════════ */}
      <section className="bg-[#010736] px-4 py-16 text-center">
        <Image
          src="/pawang-logo.png"
          alt="Pawang AI"
          width={64}
          height={64}
          className="mx-auto mb-4 rounded-full"
        />
        <h2 className="mb-3 text-3xl font-extrabold text-white sm:text-4xl">
          Siap Pantau Risiko Banjir Jakarta?
        </h2>
        <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-[#BFDDF0]">
          Buka dashboard peta sekarang dan lihat peluang banjir di kecamatan Anda hari ini.
        </p>
        <Link
          href="/map"
          className="inline-flex items-center gap-2 rounded-full bg-[#8CC0EB] px-10 py-4 text-base font-extrabold text-[#010736] shadow-lg transition hover:brightness-110"
        >
          <MapPinned size={18} /> Buka Dashboard Peta
        </Link>
      </section>

      {/* ══════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════ */}
      <footer className="border-t border-[#22396F]/30 bg-[#010736] px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-3">
            <Image src="/pawang-logo.png" alt="Logo" width={28} height={28} className="rounded-full" />
            <span className="text-sm font-bold text-[#FCF1D0]">Pawang AI</span>
          </div>
          <p className="text-xs text-[#BFDDF0]">
            Proyek prediksi banjir Jakarta — Kelompok 1, Teknik Sistem Komputer &amp; Informasi,
            Fakultas Teknik Universitas Indonesia
          </p>
          <p className="text-xs text-[#22396F]">
            Data prediksi bukan pengganti informasi resmi BPBD.
          </p>
        </div>
      </footer>
    </div>
  );
};
