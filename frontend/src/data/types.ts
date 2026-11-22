export type RiskLevel = 'Low' | 'Medium' | 'Medium-High' | 'High' | 'Extreme' | 'Unknown';

export type TimeHorizon = '1h' | '3h' | '5h' | '12h' | '24h';

export type SiagaLevel = 'Normal' | 'Siaga 4' | 'Siaga 3' | 'Siaga 2' | 'Siaga 1' | 'Tidak tersedia';

export type BasemapType = 'dark' | 'topographic' | 'osm';

export interface HydrographPoint {
  time: string;
  rainfall: number; // mm
  waterLevel: number; // cm
  threshold: number; // cm (danger line)
}

export interface EvacuationCenter {
  id: string;
  name: string;
  capacity: number;
  occupancy: number;
  contact: string;
  address: string;
  lat: number;
  lng: number;
}

export interface WaterGateStation {
  id: string;
  name: string;
  river: string;
  currentLevelCm: number;
  normalLevelCm: number;
  siaga3Cm: number;
  siaga2Cm: number;
  siaga1Cm: number;
  status: SiagaLevel;
  trend: 'rising' | 'stable' | 'falling';
  lat: number;
  lng: number;
  updatedAt: string;
}

export interface FloodGridProperties {
  grid_id: string;
  area_name: string;
  district: string;
  city: string;
  risk_level: RiskLevel;
  flood_probability: number; // 0.0 to 1.0
  rainfall_mm: number;
  water_level_cm: number;
  siaga_level: SiagaLevel;
  duration_est: string;
  peak_time: string;
  inundation_range: string;
  confidence_score: number;
  confidence_badge: string;
  recommendation: string;
  evacuation_route: string;
  affected_roads: string[];
}

export interface GeoJSONGridFeature {
  type: 'Feature';
  properties: FloodGridProperties;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

export interface HeatmapGeoJSONResponse {
  type: 'FeatureCollection';
  features: GeoJSONGridFeature[];
  metadata: {
    generated_at: string;
    forecast_horizon: TimeHorizon;
    center: [number, number];
    total_grids: number;
    high_risk_count: number;
    /** Set by the backend only: the day the model predicted. */
    target_date?: string;
  };
}

export interface AreaAnalysisResponse {
  grid_id: string;
  area_name: string;
  district: string;
  city: string;
  risk_level: RiskLevel;
  /** Model's flood probability for the day, 0..1. Null when the inputs were incomplete. */
  flood_probability?: number | null;
  duration_est: string;
  recommendation: string;
  commuter_advisory: string;
  confidence_badge: string;
  confidence_score: number;
  rainfall_mm: number;
  water_level_cm: number;
  siaga_level: SiagaLevel;
  peak_time: string;
  inundation_range: string;
  evacuation_route: string;
  affected_roads: string[];
  hydrograph: HydrographPoint[];
  /** Daily rainfall (mm) up to the predicted day, kept even where there is no water level. */
  rain_daily?: Array<{ time: string; rainfall: number }>;
  /** Open-Meteo chance of rain (%) on the predicted day. Null/absent when the source has none (archive mode). */
  rain_probability_pct?: number | null;
  nearby_stations: WaterGateStation[];
  safe_shelters: EvacuationCenter[];
  last_updated: string;
  /** Day the model predicted (YYYY-MM-DD); sent by the backend only. */
  target_date?: string;
}

/** Where the data on screen came from. 'mock' = built-in demo data (backend down or empty). */
export type DataSource = 'loading' | 'backend' | 'mock' | 'unavailable';

/** GET /api/v1/status: backend reachability and archive (replay) date range. */
export interface BackendStatus {
  source: 'backend' | 'mock';
  data_mode: 'live' | 'replay' | null;
  /** Archive days the backend can serve in replay mode (YYYY-MM-DD). */
  replay_dates: { min: string; max: string } | null;
  /** Server default day (PAWANG_DEMO_DATE) for replay mode. */
  demo_date: string | null;
}

/** One road route from POST /api/v1/route. coordinates are [lat, lng]. */
export interface RouteOption {
  coordinates: Array<[number, number]>;
  km: number;
  minutes: number;
  /** Km of the route inside areas the model rates High. */
  high_km: number;
  /** Km inside Medium-High areas (only breaks ties, never forces a detour). */
  soft_km: number;
  /** Citizen-reported flood points within about 120 m of the route. */
  flood_points: number;
  streets: string[];
}

export type RouteVerdict = 'clear' | 'safe' | 'reduced' | 'unavoidable';

export interface RouteResponse {
  target_date: string;
  verdict: RouteVerdict;
  message: string;
  /** Who worded `message`: the LLM (checked by rules) or the rules themselves. */
  explanation_by: 'qwen' | 'rules';
  recommended: RouteOption;
  fastest: RouteOption;
  same_as_fastest: boolean;
  origin_area: string | null;
  destination_area: string | null;
  flood_points_known: number;
  profile: string;
}
