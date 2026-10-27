/**
 * Official Administrative Boundary Polygon for Daerah Khusus Ibukota (DKI) Jakarta
 * Coordinates in GeoJSON format: [longitude, latitude]
 */

export interface JakartaBoundaryGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      name: string;
      province: string;
      description: string;
    };
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  }>;
}

export const JAKARTA_ADMIN_BOUNDARY: JakartaBoundaryGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Batas Administratif DKI Jakarta',
        province: 'DKI Jakarta',
        description: 'Perimeter batas wilayah daratan administratif DKI Jakarta',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            // 1. Pesisir Utara (Laut Jawa - Barat ke Timur)
            [106.7020, -6.0950], // Muara Kamal / Dadap
            [106.7210, -6.1010], // Pantai Indah Kapuk Barat
            [106.7450, -6.1050], // Kamal Muara / PIK
            [106.7680, -6.1110], // Muara Karang
            [106.7880, -6.1160], // Pesisir Pluit / Waduk Pluit
            [106.8120, -6.1240], // Sunda Kelapa / Pasar Ikan
            [106.8350, -6.1210], // Pantai Ancol
            [106.8620, -6.1140], // Kali Ancol / Pelabuhan Barat
            [106.8850, -6.1050], // Pelabuhan Tanjung Priok
            [106.9150, -6.1020], // Kalibaru / Pesisir Koja
            [106.9420, -6.0990], // Pesisir Cilincing
            [106.9650, -6.0970], // Pantai Marunda
            [106.9740, -6.0980], // Muara Kali Blencong (Batas Kab. Bekasi)

            // 2. Batas Timur (Utara ke Selatan - Perbatasan Kab. & Kota Bekasi)
            [106.9710, -6.1210], // Rorotan Timur
            [106.9680, -6.1420], // Rorotan / Segaramakmur
            [106.9650, -6.1600], // Cakung Timur Utara
            [106.9620, -6.1750], // Cakung Timur / Harapan Indah
            [106.9580, -6.2080], // Pulo Gebang / Ujung Menteng
            [106.9540, -6.2200], // Pondok Kopi Timur
            [106.9520, -6.2280], // Malaka Jaya / Bintara
            [106.9480, -6.2380], // Pondok Kelapa Utara
            [106.9460, -6.2480], // Pondok Kelapa / Jakasampurna
            [106.9380, -6.2620], // Lampiri / Kalimalang
            [106.9320, -6.2750], // Cipayung / Jatibening
            [106.9180, -6.2860], // Jatiwaringin / Lubang Buaya
            [106.9100, -6.3050], // Pinang Ranti / Setu
            [106.9080, -6.3220], // Bambu Apus / Jatimurni
            [106.9020, -6.3450], // Cilangkap / Pondok Ranggon
            [106.8950, -6.3580], // Pondok Ranggon / Jatisampurna
            [106.8920, -6.3680], // Cibubur Timur / Kali Sunter

            // 3. Batas Selatan (Timur ke Barat - Perbatasan Kota Depok)
            [106.8820, -6.3660], // Cibubur / Harjamukti
            [106.8710, -6.3620], // Ciracas / Radar Auri
            [106.8580, -6.3560], // Pekayon / Gandaria
            [106.8480, -6.3520], // Kalisari / Cijantung
            [106.8380, -6.3550], // Srengseng Sawah / UI Depok
            [106.8280, -6.3610], // Lenteng Agung Selatan / Beji
            [106.8180, -6.3600], // Jagakarsa Selatan / Kukusan
            [106.8080, -6.3550], // Ciganjur / Tanah Baru
            [106.7980, -6.3450], // Cipedak / Brigif Selatan
            [106.7890, -6.3320], // Pangkalan Jati / Gandul
            [106.7850, -6.3180], // Pangkalan Jati Baru / Cinere

            // 4. Batas Barat Daya & Barat (Selatan ke Utara - Perbatasan Tangerang Selatan & Kota Tangerang)
            [106.7810, -6.3050], // Pondok Labu / Cirendeu
            [106.7720, -6.2950], // Lebak Bulus / Ciputat Timur
            [106.7640, -6.2780], // Pondok Pinang / Rempoa
            [106.7580, -6.2680], // Bintaro Sektor 1 / Rengas
            [106.7520, -6.2550], // Pesanggrahan / Bintaro
            [106.7450, -6.2420], // Petukangan Selatan / Larangan
            [106.7380, -6.2280], // Petukangan Utara / Karang Timur
            [106.7320, -6.2150], // Joglo / Karang Tengah
            [106.7260, -6.1980], // Meruya Selatan / Kembangan
            [106.7210, -6.1850], // Meruya Utara / Cipondoh
            [106.7140, -6.1720], // Kembangan Barat / Gondrong
            [106.7080, -6.1600], // Semanan / Poris Plawad
            [106.7020, -6.1450], // Kalideres / Batuceper
            [106.6960, -6.1300], // Pegadungan / Kebon Besar
            [106.6920, -6.1180], // Tegal Alur / Benda
            [106.6950, -6.1080], // Kamal / Dadap
            [106.7020, -6.0950], // Menutup kembali ke Muara Kamal
          ],
        ],
      },
    },
  ],
};
