'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { MapPinned } from 'lucide-react';
import { AreaSearch } from './AreaSearch';
import { RISK_COLORS } from '@/utils/areaColors';

const SOURCES = [
  ['Open-Meteo', 'Prakiraan hujan hari prakiraan, hujan beberapa hari terakhir, dan peluang hujan.'],
  ['BPBD DKI Jakarta', 'Tinggi muka air sungai dan pintu air, diambil langsung dari halaman resminya.'],
  ['Satu Data Jakarta', 'Riwayat tinggi muka air dan data kejadian banjir DKI untuk melatih model.'],
  ['Copernicus DEM', 'Elevasi tiap kecamatan.'],
  ['HDX (COD-AB Indonesia)', 'Batas wilayah kecamatan.'],
  ['OpenStreetMap', 'Peta dasar.'],
] as const;

const TIERS = [
  ['Low', '< 0,8%', RISK_COLORS.Low],
  ['Medium', '0,8 - 2,15%', RISK_COLORS.Medium],
  ['Medium-High', '2,15 - 3,3%', RISK_COLORS['Medium-High']],
  ['High', '≥ 3,3%', RISK_COLORS.High],
] as const;

const card = 'rounded-xl border border-[#22396F]/60 bg-white/60 p-4 dark:bg-[#0D1C42]/70';
const h2 = 'mb-3 text-lg font-extrabold text-[#010736] dark:text-[#FCF1D0]';
const muted = 'text-sm leading-relaxed text-[#0D1C42] dark:text-[#D5E2F7]';

export const Landing: React.FC = () => {
  // Same saved theme as the map page.
  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', localStorage.getItem('pawang-theme') !== 'light');
    } catch {
      // keep the default (dark)
    }
  }, []);

  return (
    <div className="h-full w-full overflow-y-auto bg-[#FFF9D2] text-[#010736] dark:bg-[#010736] dark:text-[#FCF1D0]">
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:py-16">
        <header className="space-y-3 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Pawang AI</h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-[#0D1C42] dark:text-[#D5E2F7]">
            Perkiraan peluang banjir tiap kecamatan di Jakarta, dihitung dari hujan, tinggi muka air, dan elevasi. Untuk
            membantu warga dan pengendara bersiap, bukan untuk memastikan banjir akan terjadi.
          </p>
        </header>

        <section className="space-y-3" aria-label="Mulai">
          <AreaSearch />
          <div className="flex items-center gap-3 text-xs text-[#22396F] dark:text-[#BFDDF0]">
            <span className="h-px flex-1 bg-current opacity-30" />
            atau
            <span className="h-px flex-1 bg-current opacity-30" />
          </div>
          <Link
            href="/map"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#22396F] bg-[#8CC0EB] px-4 py-2.5 text-sm font-bold text-[#010736] shadow-md hover:brightness-105 dark:bg-[#22396F] dark:text-[#FCF1D0]"
          >
            <MapPinned size={16} aria-hidden /> Pilih langsung di peta
          </Link>
        </section>

        <section className={card}>
          <h2 className={h2}>Apa ini?</h2>
          <p className={muted}>
            Peta Jakarta yang diwarnai menurut peluang banjir tiap kecamatan untuk hari prakiraan. Klik satu kecamatan
            untuk melihat peluangnya, hujan yang diperkirakan, tinggi muka air terdekat, dan saran singkat. Warga juga
            bisa melaporkan kondisi jalan saat itu; laporan tampil di peta tetapi tidak mengubah prediksi.
          </p>
        </section>

        <section className={card}>
          <h2 className={h2}>Cara kerja</h2>
          <ol className={`${muted} list-decimal space-y-2 pl-5`}>
            <li>
              <b>Ambil data.</b> Hujan hari prakiraan dan hari-hari sebelumnya, tinggi muka air terbaru, dan elevasi
              kecamatan. Data yang terlalu lama dianggap tidak segar.
            </li>
            <li>
              <b>Hitung peluang.</b> Model regresi logistik yang dilatih dari kejadian banjir DKI menghasilkan peluang
              banjir tiap kecamatan untuk satu hari. Bila tinggi muka air tidak tersedia, dipakai model yang hanya
              memakai hujan dan elevasi.
            </li>
            <li>
              <b>Beri kategori.</b> Peluang dibagi menjadi empat kategori warna:
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TIERS.map(([name, range, color]) => (
                  <li key={name} className="flex items-center gap-2 rounded-lg border border-[#22396F]/40 px-2 py-1.5">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="text-xs">
                      <b>{name}</b>
                      <br />
                      {range}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
            <li>
              <b>Tulis saran.</b> Agen AI mengatur pengambilan data dan menulis saran, dengan pagar aturan yang menolak
              jawaban berisi angka karangan atau klaim pasti. Bila gagal, dipakai teks saran standar.
            </li>
          </ol>
          <p className="mt-3 rounded-lg bg-amber-500/15 p-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            <b>Batasan:</b> ini perkiraan. Pada evaluasi data 2020, model menangkap sekitar separuh kejadian banjir
            berkategori High, dan hanya sekitar 1 dari 6 peringatan High yang benar-benar banjir. Selalu cek info resmi
            BPBD.
          </p>
        </section>

        <section className={card}>
          <h2 className={h2}>Sumber data</h2>
          <ul className="space-y-2">
            {SOURCES.map(([name, use]) => (
              <li key={name} className={muted}>
                <b>{name}</b> - {use}
              </li>
            ))}
          </ul>
        </section>

        <footer className="pb-4 text-center text-xs text-[#22396F] dark:text-[#BFDDF0]">
          Pawang AI - proyek prediksi banjir Jakarta.
        </footer>
      </main>
    </div>
  );
};
