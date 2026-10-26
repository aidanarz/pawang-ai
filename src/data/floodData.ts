import {
  GeoJSONGridFeature,
  WaterGateStation,
  EvacuationCenter,
  TimeHorizon,
  RiskLevel,
  AreaAnalysisResponse,
} from './types';

export const WATER_GATE_STATIONS: WaterGateStation[] = [
  {
    id: 'GAUGE-MGR',
    name: 'Pintu Air Manggarai',
    river: 'Sungai Ciliwung',
    currentLevelCm: 795,
    normalLevelCm: 600,
    siaga3Cm: 750,
    siaga2Cm: 850,
    siaga1Cm: 950,
    status: 'Siaga 3',
    trend: 'rising',
    lat: -6.2081,
    lng: 106.8488,
    updatedAt: '10 Menit yang lalu',
  },
  {
    id: 'GAUGE-KTL',
    name: 'Bendung Katulampa',
    river: 'Sungai Ciliwung Hulu',
    currentLevelCm: 160,
    normalLevelCm: 50,
    siaga3Cm: 80,
    siaga2Cm: 150,
    siaga1Cm: 200,
    status: 'Siaga 2',
    trend: 'rising',
    lat: -6.6339,
    lng: 106.8375,
    updatedAt: '5 Menit yang lalu',
  },
  {
    id: 'GAUGE-DPK',
    name: 'Pos Pantau Depok',
    river: 'Sungai Ciliwung Tengah',
    currentLevelCm: 230,
    normalLevelCm: 100,
    siaga3Cm: 200,
    siaga2Cm: 270,
    siaga1Cm: 350,
    status: 'Siaga 3',
    trend: 'rising',
    lat: -6.4025,
    lng: 106.8322,
    updatedAt: '12 Menit yang lalu',
  },
  {
    id: 'GAUGE-PSI',
    name: 'Pintu Air Pasar Ikan',
    river: 'Teluk Jakarta (Rob)',
    currentLevelCm: 205,
    normalLevelCm: 150,
    siaga3Cm: 180,
    siaga2Cm: 200,
    siaga1Cm: 250,
    status: 'Siaga 2',
    trend: 'rising',
    lat: -6.1268,
    lng: 106.8089,
    updatedAt: '8 Menit yang lalu',
  },
  {
    id: 'GAUGE-KRT',
    name: 'Pintu Air Karet',
    river: 'Banjir Kanal Barat',
    currentLevelCm: 530,
    normalLevelCm: 350,
    siaga3Cm: 450,
    siaga2Cm: 550,
    siaga1Cm: 650,
    status: 'Siaga 3',
    trend: 'stable',
    lat: -6.2005,
    lng: 106.8143,
    updatedAt: '15 Menit yang lalu',
  },
  {
    id: 'GAUGE-PSG',
    name: 'Pos Pantau Pesanggrahan',
    river: 'Kali Pesanggrahan',
    currentLevelCm: 185,
    normalLevelCm: 90,
    siaga3Cm: 150,
    siaga2Cm: 210,
    siaga1Cm: 280,
    status: 'Siaga 3',
    trend: 'rising',
    lat: -6.2574,
    lng: 106.7725,
    updatedAt: '10 Menit yang lalu',
  },
  {
    id: 'GAUGE-SNTR',
    name: 'Pos Sunter Hulu',
    river: 'Kali Sunter',
    currentLevelCm: 145,
    normalLevelCm: 80,
    siaga3Cm: 140,
    siaga2Cm: 200,
    siaga1Cm: 250,
    status: 'Siaga 3',
    trend: 'stable',
    lat: -6.2941,
    lng: 106.8992,
    updatedAt: '20 Menit yang lalu',
  },
];

export const EVACUATION_CENTERS: EvacuationCenter[] = [
  {
    id: 'EVAC-OTISTA',
    name: 'GOR Remaja Otista',
    capacity: 450,
    occupancy: 68,
    contact: '0812-9988-1122 (BPBD Posko Timur)',
    address: 'Jl. Otto Iskandardinata No. 121, Jatinegara',
    lat: -6.2345,
    lng: 106.8665,
  },
  {
    id: 'EVAC-MGR',
    name: 'Aula Wisma Wisata Menteng',
    capacity: 300,
    occupancy: 24,
    contact: '021-3901122 (Dinsos DKI)',
    address: 'Jl. Tambak No. 10, Manggarai Selatan',
    lat: -6.2052,
    lng: 106.8499,
  },
  {
    id: 'EVAC-KMG',
    name: 'RPTRA Bangka Asri Kemang',
    capacity: 250,
    occupancy: 35,
    contact: '0813-1122-4455 (Satgas Kelurahan Bangka)',
    address: 'Jl. Bangka II No. 15, Mampang Prapatan',
    lat: -6.2555,
    lng: 106.8182,
  },
  {
    id: 'EVAC-PLT',
    name: 'Posko Siaga Rob Pluit Kencana',
    capacity: 600,
    occupancy: 110,
    contact: '0811-7788-9900 (Tagana Jakut)',
    address: 'Jl. Pluit Kencana Raya No. 4, Penjaringan',
    lat: -6.1215,
    lng: 106.7932,
  },
  {
    id: 'EVAC-RWJ',
    name: 'Pusdiklat Ditjen Pajak Rawajati',
    capacity: 350,
    occupancy: 42,
    contact: '0815-4433-2211 (Relawan Ciliwung)',
    address: 'Jl. Bina Warga No. 1, Rawajati, Pancoran',
    lat: -6.2588,
    lng: 106.8552,
  },
];

// Helper to create smooth, natural organic river basin contours (non-boxy)
function createOrganicPolygon(
  lat: number,
  lng: number,
  deltaLat = 0.016,
  deltaLng = 0.020,
  seed = 1.0
): number[][][] {
  const ring: number[][] = [];
  const totalVertices = 24;
  for (let i = 0; i <= totalVertices; i++) {
    const angle = (i / totalVertices) * 2 * Math.PI;
    // Harmonic wave perturbation for natural hydrologic basin shape
    const distortion =
      1.0 +
      0.22 * Math.sin(angle * 3 + seed) +
      0.12 * Math.cos(angle * 5 + seed * 1.5) +
      0.08 * Math.sin(angle * 7);
    const pLng = lng + Math.cos(angle) * deltaLng * distortion;
    const pLat = lat + Math.sin(angle) * deltaLat * distortion;
    ring.push([Math.round(pLng * 100000) / 100000, Math.round(pLat * 100000) / 100000]);
  }
  return [ring];
}

export const BASE_FLOOD_ZONES: GeoJSONGridFeature[] = [
  {
    type: 'Feature',
    properties: {
      grid_id: 'JKT-KML-01',
      area_name: 'Kampung Melayu & Bukit Duri',
      district: 'Jatinegara & Tebet',
      city: 'Jakarta Timur / Selatan',
      risk_level: 'High',
      flood_probability: 0.88,
      rainfall_mm: 24.5,
      water_level_cm: 185,
      siaga_level: 'Siaga 2',
      duration_est: '5 jam berikutnya (Puncak: 14:15 WIB)',
      peak_time: '14:15 WIB',
      inundation_range: '50 - 140 cm',
      confidence_score: 96.4,
      confidence_badge: 'High Data Confidence',
      recommendation: 'Hindari melintasi kolong flyover Kampung Melayu dan bantaran Kali Ciliwung. Warga RW 01-03 segera amankan dokumen ke lantai 2.',
      evacuation_route: 'Jalur evakuasi bebas genangan via Jl. Otto Iskandardinata mengarah ke GOR Remaja Otista.',
      affected_roads: ['Jl. Jatinegara Barat', 'Jl. Bukit Duri Selatan', 'Jl. KH Abdullah Syafei'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.2285, 106.8640, 0.016, 0.020, 1.2),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'JKT-MGR-02',
      area_name: 'Pintu Air Manggarai & Sekitarnya',
      district: 'Tebet / Menteng',
      city: 'Jakarta Selatan / Pusat',
      risk_level: 'High',
      flood_probability: 0.79,
      rainfall_mm: 19.8,
      water_level_cm: 795,
      siaga_level: 'Siaga 3',
      duration_est: '4 jam berikutnya (Limpasan bertahap)',
      peak_time: '13:45 WIB',
      inundation_range: '30 - 80 cm',
      confidence_score: 94.8,
      confidence_badge: 'High Data Confidence',
      recommendation: 'Pintu air beroperasi penuh. Arus Kali Ciliwung sangat deras. Waspadai genangan di Underpass Manggarai dan Jl. Tambak.',
      evacuation_route: 'Gunakan Jl. Sultan Agung ke arah Kuningan atau Jl. Proklamasi menuju Menteng.',
      affected_roads: ['Underpass Manggarai', 'Jl. Tambak', 'Jl. Manggarai Utara 2'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.2081, 106.8488, 0.015, 0.018, 2.5),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'JKT-KMG-03',
      area_name: 'Kemang Raya & Kali Krukut',
      district: 'Mampang Prapatan',
      city: 'Jakarta Selatan',
      risk_level: 'High',
      flood_probability: 0.82,
      rainfall_mm: 22.1,
      water_level_cm: 120,
      siaga_level: 'Siaga 2',
      duration_est: '5 jam berikutnya (Genangan meluas)',
      peak_time: '15:00 WIB',
      inundation_range: '40 - 110 cm',
      confidence_score: 93.1,
      confidence_badge: 'High Data Confidence',
      recommendation: 'Hindari bepergian dengan sepeda motor atau sedan melintasi Kemang Raya. Pohon rawan tumbang dilaporkan dekat Plaza Kemang 88.',
      evacuation_route: 'Jalur alternatif bebas banjir via Jl. Pangeran Antasari (Elevated) atau Jl. Bangka Raya.',
      affected_roads: ['Jl. Kemang Raya', 'Jl. Kemang Selatan VIII', 'Jl. Taman Kemang'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.2620, 106.8160, 0.018, 0.022, 3.8),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'JKT-RWJ-04',
      area_name: 'Rawajati & Kalibata',
      district: 'Pancoran',
      city: 'Jakarta Selatan',
      risk_level: 'Extreme',
      flood_probability: 0.94,
      rainfall_mm: 34.0,
      water_level_cm: 260,
      siaga_level: 'Siaga 1',
      duration_est: '6 jam berikutnya (Air kiriman Bogor tiba)',
      peak_time: '14:00 WIB',
      inundation_range: '80 - 220 cm',
      confidence_score: 97.2,
      confidence_badge: 'High Data Confidence',
      recommendation: 'PERINGATAN DINI: Air kiriman dari Bendung Katulampa diprediksi tiba dalam 60-90 menit. Evakuasi lansia dan balita ke Pusdiklat Pajak sekarang!',
      evacuation_route: 'Menuju Pusdiklat Pajak Rawajati via Flyover Kalibata menuju Jl. Pasar Minggu.',
      affected_roads: ['Jl. Bina Warga Rawajati', 'Jl. Kalibata Timur', 'Bantaran Ciliwung RW 07'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.2575, 106.8550, 0.016, 0.020, 4.2),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'JKT-PLT-05',
      area_name: 'Pluit & Muara Baru (Banjir Rob)',
      district: 'Penjaringan',
      city: 'Jakarta Utara',
      risk_level: 'Medium',
      flood_probability: 0.64,
      rainfall_mm: 8.5,
      water_level_cm: 205,
      siaga_level: 'Siaga 2',
      duration_est: '3 jam berikutnya (Puncak pasang laut)',
      peak_time: '16:30 WIB',
      inundation_range: '25 - 60 cm',
      confidence_score: 89.0,
      confidence_badge: 'Moderate Confidence',
      recommendation: 'Pasang air laut maksimum bertepatan dengan hujan lokal. Pompa Waduk Pluit diaktifkan 8 unit. Waspadai licin di kawasan pelabuhan.',
      evacuation_route: 'Melalui Jl. Pluit Selatan Raya mengarah ke Tol Bandara Prof. Dr. Sedyatmo.',
      affected_roads: ['Jl. Muara Baru Raya', 'Jl. Pluit Karang Barat', 'Kawasan Dermaga Ikan'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.1235, 106.7970, 0.017, 0.024, 5.1),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'JKT-KLG-06',
      area_name: 'Kelapa Gading & Boulevard Barat',
      district: 'Kelapa Gading',
      city: 'Jakarta Utara',
      risk_level: 'Medium',
      flood_probability: 0.58,
      rainfall_mm: 12.0,
      water_level_cm: 45,
      siaga_level: 'Siaga 3',
      duration_est: '3 jam berikutnya',
      peak_time: '13:30 WIB',
      inundation_range: '15 - 45 cm',
      confidence_score: 91.5,
      confidence_badge: 'High Data Confidence',
      recommendation: 'Genangan lokal pada lajur lambat Boulevard Barat. Polder Sunter berfungsi normal namun debit air tinggi.',
      evacuation_route: 'Gunakan lajur cepat atau jalur Tol Cempaka Putih - Pulomas.',
      affected_roads: ['Jl. Boulevard Barat Raya', 'Jl. Artha Gading Selatan', 'Depan MOI'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.1580, 106.8920, 0.018, 0.024, 6.3),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'JKT-RWB-07',
      area_name: 'Rawa Buaya & Cengkareng',
      district: 'Cengkareng',
      city: 'Jakarta Barat',
      risk_level: 'High',
      flood_probability: 0.75,
      rainfall_mm: 18.4,
      water_level_cm: 95,
      siaga_level: 'Siaga 2',
      duration_est: '4 jam berikutnya',
      peak_time: '14:45 WIB',
      inundation_range: '35 - 90 cm',
      confidence_score: 92.0,
      confidence_badge: 'High Data Confidence',
      recommendation: 'Luapan Kali Mookervaart mengancam pemukiman RW 01 dan 02. Waspadai genangan tinggi di perlintasan rel kereta api stasiun Rawa Buaya.',
      evacuation_route: 'Jl. Daan Mogot arah Grogol bebas genangan di lajur tengah.',
      affected_roads: ['Jl. Bojong Indah Raya', 'Jl. Inspeksi Kali Mookervaart', 'Kolong Tol Cengkareng'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.1550, 106.7260, 0.018, 0.022, 7.4),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'JKT-PSG-08',
      area_name: 'Pondok Pinang & Cipulir',
      district: 'Kebayoran Lama',
      city: 'Jakarta Selatan',
      risk_level: 'Medium',
      flood_probability: 0.62,
      rainfall_mm: 14.2,
      water_level_cm: 185,
      siaga_level: 'Siaga 3',
      duration_est: '4 jam berikutnya',
      peak_time: '15:15 WIB',
      inundation_range: '20 - 70 cm',
      confidence_score: 90.2,
      confidence_badge: 'High Data Confidence',
      recommendation: 'Debit Kali Pesanggrahan naik. Pasar Cipulir dan pemukiman bantaran diimbau waspada.',
      evacuation_route: 'Arahkan kendaraan via Jl. Metro Pondok Indah atau Tol JORR W2.',
      affected_roads: ['Jl. Ciledug Raya depan Pasar Cipulir', 'Jl. Deplu Raya', 'Gg. Musholla'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.2480, 106.7720, 0.017, 0.020, 8.1),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'TNG-CLD-09',
      area_name: 'Ciledug Indah & Karang Tengah',
      district: 'Ciledug',
      city: 'Kota Tangerang',
      risk_level: 'High',
      flood_probability: 0.81,
      rainfall_mm: 21.0,
      water_level_cm: 130,
      siaga_level: 'Siaga 2',
      duration_est: '5 jam berikutnya',
      peak_time: '14:30 WIB',
      inundation_range: '40 - 120 cm',
      confidence_score: 93.7,
      confidence_badge: 'High Data Confidence',
      recommendation: 'Tanggul Kali Angke terpantau kritis. Hindari komplek Perumahan Ciledug Indah 1 & 2. Siapkan pompa mandiri.',
      evacuation_route: 'Jl. KH Hasyim Ashari ke arah Graha Raya / Bintaro.',
      affected_roads: ['Jl. KH Hasyim Ashari km 8', 'Pintu Masuk Ciledug Indah 1', 'Jembatan Ciledug'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.2220, 106.6980, 0.019, 0.022, 9.0),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'BKS-PND-10',
      area_name: 'Kali Bekasi & Pondok Gede Permai',
      district: 'Jatiasih',
      city: 'Kota Bekasi',
      risk_level: 'Extreme',
      flood_probability: 0.91,
      rainfall_mm: 31.5,
      water_level_cm: 290,
      siaga_level: 'Siaga 1',
      duration_est: '5 jam berikutnya',
      peak_time: '13:50 WIB',
      inundation_range: '90 - 250 cm',
      confidence_score: 95.8,
      confidence_badge: 'High Data Confidence',
      recommendation: 'PERINGATAN BAHAYA: Pertemuan Sungai Cikeas dan Cileungsi meluap masif. Tanggul darurat berpotensi rembes. Segera evakuasi warga blok D & E!',
      evacuation_route: 'Keluar komplek menuju Jl. Raya Jatirasa atau Tol JORR Jatiasih.',
      affected_roads: ['Jl. Villa Nusa Indah', 'Jl. Pondok Gede Permai', 'Bantaran Kali Bekasi'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.3080, 106.9740, 0.020, 0.024, 10.2),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'BGR-KTL-11',
      area_name: 'Bendung Katulampa & Bogor Hulu',
      district: 'Bogor Timur',
      city: 'Kota Bogor',
      risk_level: 'High',
      flood_probability: 0.84,
      rainfall_mm: 28.0,
      water_level_cm: 160,
      siaga_level: 'Siaga 2',
      duration_est: 'Debit hulu meningkat (Perjalanan air ke Jakarta ~9-11 jam)',
      peak_time: '12:30 WIB',
      inundation_range: '30 - 90 cm',
      confidence_score: 98.1,
      confidence_badge: 'High Data Confidence',
      recommendation: 'Hujan deras berdurasi panjang di Puncak (Cisarua). Debit aliran Ciliwung meningkat tajam menjadi 340 m³/detik.',
      evacuation_route: 'Jauhi sempadan sungai Ciliwung di sepanjang Baranangsiang & Katulampa.',
      affected_roads: ['Jl. Katulampa Raya', 'Jembatan Ciliwung Baranangsiang', 'Jl. Pajajaran'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.6339, 106.8375, 0.022, 0.024, 11.5),
    },
  },
  {
    type: 'Feature',
    properties: {
      grid_id: 'JKT-GLD-12',
      area_name: 'Glodok & Kali Krukut Hilir',
      district: 'Taman Sari',
      city: 'Jakarta Barat',
      risk_level: 'Low',
      flood_probability: 0.28,
      rainfall_mm: 2.5,
      water_level_cm: 20,
      siaga_level: 'Normal',
      duration_est: 'Kondisi relatif stabil pada 5 jam ke depan',
      peak_time: '14:00 WIB',
      inundation_range: '0 - 15 cm',
      confidence_score: 88.5,
      confidence_badge: 'High Data Confidence',
      recommendation: 'Kondisi saluran dan drainase utama lancar. Potensi genangan air dangkal di bahu jalan saat hujan lebat tiba.',
      evacuation_route: 'Aktivitas normal. Akses lancar via Jl. Gajah Mada dan Hayam Wuruk.',
      affected_roads: ['Jl. Pinangsia Timur (Genangan minor)', 'Jl. Mangga Besar IX'],
    },
    geometry: {
      type: 'Polygon',
      coordinates: createOrganicPolygon(-6.1450, 106.8150, 0.016, 0.018, 12.1),
    },
  },
];

// Generate dynamic hydrograph for an area based on base water level and rainfall
export function generateHydrograph(baseLevel: number, baseRain: number) {
  const points = [];
  const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
  const factors = [0.65, 0.85, 1.15, 1.45, 1.25, 0.95, 0.75, 0.60];

  for (let i = 0; i < hours.length; i++) {
    points.push({
      time: hours[i],
      rainfall: Math.round(baseRain * factors[i] * 10) / 10,
      waterLevel: Math.round(baseLevel * factors[i]),
      threshold: Math.round(baseLevel * 1.1),
    });
  }
  return points;
}

// Multiplier based on Time Horizon
export function adjustFeaturesForTimeHorizon(
  features: GeoJSONGridFeature[],
  horizon: TimeHorizon
): GeoJSONGridFeature[] {
  let rainMultiplier = 1.0;
  let probMultiplier = 1.0;

  switch (horizon) {
    case '1h':
      rainMultiplier = 0.7;
      probMultiplier = 0.85;
      break;
    case '3h':
      rainMultiplier = 0.9;
      probMultiplier = 0.95;
      break;
    case '5h':
      rainMultiplier = 1.0;
      probMultiplier = 1.0;
      break;
    case '12h':
      rainMultiplier = 1.25;
      probMultiplier = 1.12;
      break;
    case '24h':
      rainMultiplier = 0.85;
      probMultiplier = 0.9;
      break;
  }

  return features.map((f) => {
    const adjustedRain = Math.round(f.properties.rainfall_mm * rainMultiplier * 10) / 10;
    const adjustedProb = Math.min(0.98, Math.max(0.1, Math.round(f.properties.flood_probability * probMultiplier * 100) / 100));

    let riskLevel: RiskLevel = 'Low';
    if (adjustedRain >= 25 || adjustedProb >= 0.85) riskLevel = 'Extreme';
    else if (adjustedRain >= 15 || adjustedProb >= 0.70) riskLevel = 'High';
    else if (adjustedRain >= 5 || adjustedProb >= 0.45) riskLevel = 'Medium';

    return {
      ...f,
      properties: {
        ...f.properties,
        rainfall_mm: adjustedRain,
        flood_probability: adjustedProb,
        risk_level: riskLevel,
        duration_est: `${horizon} berikutnya (Simulasi Model Pawang-Hydrology v2.4)`,
      },
    };
  });
}

// Find analysis details for a grid ID
export function getAnalysisForGrid(gridId: string): AreaAnalysisResponse {
  const feature = BASE_FLOOD_ZONES.find((f) => f.properties.grid_id === gridId) || BASE_FLOOD_ZONES[0];
  const p = feature.properties;

  return {
    grid_id: p.grid_id,
    area_name: p.area_name,
    district: p.district,
    city: p.city,
    risk_level: p.risk_level,
    duration_est: p.duration_est,
    recommendation: p.recommendation,
    commuter_advisory: p.risk_level === 'Extreme' || p.risk_level === 'High'
      ? 'Hindari bepergian dengan menggunakan kendaraan roda dua, hindari pohon rawan tumbang, dan gunakan jalan layang / rute alternatif.'
      : 'Kondisi perjalanan relatif aman. Selalu siapkan jas hujan dan pantau pergerakan radar.',
    confidence_badge: p.confidence_badge,
    confidence_score: p.confidence_score,
    rainfall_mm: p.rainfall_mm,
    water_level_cm: p.water_level_cm,
    siaga_level: p.siaga_level,
    peak_time: p.peak_time,
    inundation_range: p.inundation_range,
    evacuation_route: p.evacuation_route,
    affected_roads: p.affected_roads,
    hydrograph: generateHydrograph(p.water_level_cm, p.rainfall_mm),
    nearby_stations: WATER_GATE_STATIONS.slice(0, 3),
    safe_shelters: EVACUATION_CENTERS.slice(0, 2),
    last_updated: 'Baru saja dianalisis oleh AI Engine',
  };
}

/**
 * Generate smooth continuous hydrologic heat points across Greater Jakarta river basins.
 * Provides continuous fluid Gaussian heat density with zero boxes/rectangles.
 */
export function getDenseHeatPoints(horizon: TimeHorizon): Array<[number, number, number]> {
  let intensityFactor = 1.0;
  if (horizon === '1h') intensityFactor = 0.75;
  else if (horizon === '3h') intensityFactor = 0.90;
  else if (horizon === '5h') intensityFactor = 1.0;
  else if (horizon === '12h') intensityFactor = 1.15;
  else if (horizon === '24h') intensityFactor = 0.85;

  const corridors = [
    // 1. Sungai Ciliwung Corridor (Katulampa -> Depok -> Rawajati -> Tebet -> Manggarai -> Pasar Ikan)
    { lat: -6.6339, lng: 106.8375, baseIntensity: 0.85 }, // Katulampa
    { lat: -6.6020, lng: 106.8290, baseIntensity: 0.80 },
    { lat: -6.5510, lng: 106.8310, baseIntensity: 0.78 },
    { lat: -6.4850, lng: 106.8340, baseIntensity: 0.82 }, // Bojonggede
    { lat: -6.4025, lng: 106.8322, baseIntensity: 0.88 }, // Depok Panus
    { lat: -6.3550, lng: 106.8350, baseIntensity: 0.84 }, // Lenteng Agung
    { lat: -6.3100, lng: 106.8480, baseIntensity: 0.86 }, // Pasar Minggu
    { lat: -6.2575, lng: 106.8550, baseIntensity: 0.98 }, // Rawajati / Kalibata
    { lat: -6.2420, lng: 106.8600, baseIntensity: 0.94 }, // Pengadegan
    { lat: -6.2285, lng: 106.8640, baseIntensity: 0.96 }, // Kampung Melayu
    { lat: -6.2180, lng: 106.8570, baseIntensity: 0.92 }, // Bukit Duri
    { lat: -6.2081, lng: 106.8488, baseIntensity: 0.90 }, // Manggarai
    { lat: -6.1850, lng: 106.8410, baseIntensity: 0.75 }, // Kwitang
    { lat: -6.1680, lng: 106.8310, baseIntensity: 0.70 }, // Istiqlal
    { lat: -6.1400, lng: 106.8250, baseIntensity: 0.72 }, // Gunung Sahari
    { lat: -6.1268, lng: 106.8089, baseIntensity: 0.85 }, // Pasar Ikan

    // 2. Kali Krukut & Mampang Corridor (Cinere -> Kemang -> Mampang -> Rasuna Said)
    { lat: -6.3200, lng: 106.8020, baseIntensity: 0.70 },
    { lat: -6.2850, lng: 106.8110, baseIntensity: 0.82 },
    { lat: -6.2620, lng: 106.8160, baseIntensity: 0.92 }, // Kemang Raya
    { lat: -6.2500, lng: 106.8220, baseIntensity: 0.88 }, // Bangka
    { lat: -6.2380, lng: 106.8250, baseIntensity: 0.84 }, // Mampang Prapatan
    { lat: -6.2180, lng: 106.8230, baseIntensity: 0.78 }, // Kuningan Barat
    { lat: -6.2005, lng: 106.8143, baseIntensity: 0.82 }, // Karet BKB
    { lat: -6.1750, lng: 106.8120, baseIntensity: 0.65 }, // Cideng
    { lat: -6.1450, lng: 106.8150, baseIntensity: 0.40 }, // Glodok

    // 3. Kali Pesanggrahan Corridor (Sawangan -> Cipulir -> Kebayoran -> Kedoya)
    { lat: -6.3150, lng: 106.7620, baseIntensity: 0.72 },
    { lat: -6.2780, lng: 106.7680, baseIntensity: 0.78 },
    { lat: -6.2574, lng: 106.7725, baseIntensity: 0.84 }, // Pos Pesanggrahan
    { lat: -6.2480, lng: 106.7720, baseIntensity: 0.80 }, // Cipulir
    { lat: -6.2180, lng: 106.7650, baseIntensity: 0.75 }, // Ulujami
    { lat: -6.1850, lng: 106.7600, baseIntensity: 0.70 }, // Kedoya

    // 4. Kali Angke & Mookervaart Corridor (Ciledug -> Rawa Buaya -> Cengkareng -> Kapuk)
    { lat: -6.2220, lng: 106.6980, baseIntensity: 0.92 }, // Ciledug Indah
    { lat: -6.2050, lng: 106.7080, baseIntensity: 0.86 }, // Karang Tengah
    { lat: -6.1780, lng: 106.7150, baseIntensity: 0.82 }, // Semanan
    { lat: -6.1550, lng: 106.7260, baseIntensity: 0.90 }, // Rawa Buaya
    { lat: -6.1420, lng: 106.7350, baseIntensity: 0.85 }, // Cengkareng
    { lat: -6.1280, lng: 106.7550, baseIntensity: 0.78 }, // Kapuk Poglar

    // 5. Kali Bekasi Corridor (Cikeas/Cileungsi -> PGP -> Jatiasih -> Bekasi Timur)
    { lat: -6.3450, lng: 106.9650, baseIntensity: 0.88 },
    { lat: -6.3080, lng: 106.9740, baseIntensity: 0.98 }, // Pondok Gede Permai
    { lat: -6.2820, lng: 106.9850, baseIntensity: 0.90 }, // Jatiasih
    { lat: -6.2550, lng: 106.9920, baseIntensity: 0.86 }, // Kemang Pratama
    { lat: -6.2350, lng: 107.0050, baseIntensity: 0.82 }, // Bekasi Timur

    // 6. Kali Sunter & Cipinang Corridor
    { lat: -6.2941, lng: 106.8992, baseIntensity: 0.75 }, // Sunter Hulu
    { lat: -6.2550, lng: 106.8850, baseIntensity: 0.82 }, // Cipinang Melayu
    { lat: -6.2150, lng: 106.8880, baseIntensity: 0.78 }, // Cipinang Muara
    { lat: -6.1850, lng: 106.8900, baseIntensity: 0.72 }, // Pulomas
    { lat: -6.1580, lng: 106.8920, baseIntensity: 0.76 }, // Kelapa Gading
    { lat: -6.1350, lng: 106.8850, baseIntensity: 0.68 }, // Danau Sunter

    // 7. Jakarta Coastal Rob Inundation (Pluit, Muara Baru, Penjaringan)
    { lat: -6.1150, lng: 106.7850, baseIntensity: 0.78 }, // Muara Angke
    { lat: -6.1235, lng: 106.7970, baseIntensity: 0.85 }, // Pluit Kencana
    { lat: -6.1215, lng: 106.8080, baseIntensity: 0.88 }, // Muara Baru
    { lat: -6.1250, lng: 106.8250, baseIntensity: 0.72 }, // Ancol Barat
  ];

  const heatPoints: Array<[number, number, number]> = [];

  corridors.forEach((node) => {
    const intensity = Math.min(1.0, Math.max(0.15, node.baseIntensity * intensityFactor));
    heatPoints.push([node.lat, node.lng, intensity]);

    // Radial dispersion points around each node to produce continuous smooth fluid field
    const offsets = [
      { dLat: 0.005, dLng: 0.006, f: 0.88 },
      { dLat: -0.005, dLng: -0.006, f: 0.88 },
      { dLat: 0.006, dLng: -0.005, f: 0.82 },
      { dLat: -0.006, dLng: 0.005, f: 0.82 },
      { dLat: 0.010, dLng: 0.008, f: 0.55 },
      { dLat: -0.009, dLng: -0.008, f: 0.55 },
      { dLat: 0.008, dLng: -0.009, f: 0.50 },
      { dLat: -0.008, dLng: 0.009, f: 0.50 },
    ];

    offsets.forEach((off) => {
      heatPoints.push([
        node.lat + off.dLat,
        node.lng + off.dLng,
        intensity * off.f,
      ]);
    });
  });

  return heatPoints;
}
