# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project does not use version numbers yet,
so entries are grouped by working date. Result details: [TRAINING_RESULTS.md](TRAINING_RESULTS.md); report: [REPORT.md](REPORT.md).

## [Unreleased] — 2026-10-27

### Changed (default behavior)
- **Primary prediction unit = kecamatan (sub-district)** (`config.UNIT`, env `PAWANG_UNIT`; options `kelurahan|kecamatan|kota`).
  `build_dataset` aggregates the kelurahan table to the unit; `train` and `cv` use the unit table.
- **Default algorithm = logistic regression** (`config.MODEL_ALGO`, `LOGISTIC_C = 0.01`); XGBoost remains available.
- **Default calibration = sigmoid** (`config.CALIBRATION`); isotonic is used only when `CALIBRATION="auto"`.
- `USE_LATLON = False`; XGBoost parameters made conservative (depth 3, strong regularization).
- `FloodPredictor` selects the model file from `meta.json` (`algo`) instead of a fixed file name.
- `meta.json` now records `algo`, `unit`, and `rain_source`; `model_version` includes the algorithm name.
- `train.run` deletes stale model files of other algorithms in the model folder.

### Added
- `src/aggregate.py`: kelurahan → kecamatan/city aggregation (same rules for training and inference), plus the
  `cell_unit_map.csv` and `static_features_unit.csv` maps.
- `FloodPredictor`: `with_static_kelurahan`, `to_units`, `predict_from_kelurahan`, `unit` attribute; clear error for
  unknown `cell_id`.
- `src/linear_model.py`: logistic regression with median imputation + standardization, saved/loaded as JSON.
- `src/cv.py`: leave-one-year-out cross-validation → `data/processed/cv_by_year.csv`.
- Alternative rainfall sources (`PAWANG_RAIN_SOURCE=imerg|chirps`) with caching and separate training tables:
  `src/fetch_imerg.py` (NASA GPM IMERG V07 via OPeNDAP, Earthdata token, resumable per-day cache, stops on
  401/403/429), `src/fetch_chirps.py`.
- Gap filling for the alternative sources from Open-Meteo (with a note when loading).
- `src/env.py`: dependency-free `.env` loader (does not override existing variables; does not print values).
- `README.md` updated; new tests: both algorithms, JSON round-trip, calibration preserves ranking, aggregation rules,
  kelurahan↔kecamatan parity, rejection of unknown `cell_id`. Total **37 tests passing**.

### Fixed
- Isotonic calibration created tied scores and cut PR-AUC by 2–3×; this had made XGBoost look much worse than it was.
- IMERG download crash: netCDF-C is not thread-safe (in-memory dataset names collided across threads) → parsing is now locked.
- Gappy rainfall caches were treated as valid; they are now rejected when > 2% of days are missing, and a gappy download fails hard.
- `build_dataset.py`: syntax error in the aggregation message.

## 2026-10-26

### Added
- `src/fetch_tma.py`: download 2016–2020 water-level (TMA) data from the Satu Data API (streaming, retry, full-JSON validation),
  convert to CSV, fix coordinate formats.
- `src/fetch_dem.py`: download Copernicus DEM GLO-30 tiles from AWS (no account needed).
- `src/build_centroids.py`: centroids of 264 kelurahan from HDX COD-AB (BPS) admin4 boundaries; name matching with flood data 99.2%.
- `src/geo.py`: `fix_proj_env()` (PROJ conflict with PostgreSQL/PostGIS on the development machine).
- `tests/test_real_formats.py`: tests for the flood date parser, coordinate fixes, HTML-`.xls`, and TMA units/renames/spikes.
- Dependencies: `lxml`, `pyogrio`, `shapely` (+ optional `netCDF4` for IMERG).

### Changed
- `build_tma.py`: convert mm → cm (`TMA_UNIT_DIVISOR = 10`); zeros treated as missing; spikes > 3× the 99.5th percentile dropped;
  dates must fall within ±1 month of `periode_data`; station names merged by coordinates (≤ 150 m) + `TMA_STATION_FIX`.
  Previously the `MAX_ABS_CM = 5000` limit would have dropped almost all data from large stations.
- `flood.py`: date parser based on `periode_data` + list of days (`expand_flood_dates`); inundation depth uses the
  largest number in a range; files without a date column (2023/2024) are skipped with a warning.
- `utils.match_cells`: whitespace-insensitive matching, fuzzy kecamatan, unique tokens (`Bale Kambang` ↔ `balekambang`, `Kampung Tengah` ↔ `tengah`).
- `audit_data.py`: uses the same flood parser as training; recognizes derived station coordinates.
- `config.STATION_FILE_ALIASES` recognizes `station_id`.

### Fixed
- `.xls` files from Satu Data turned out to be HTML → `read_table` detects the content and uses `read_html`.
- Flood dates for 2018–2019 parsed 0% (`TGL. 15, 16`); 2020 was misread as the current year (`11 OKTOBER` → 2026).
- DEM CRS read as `None` because of the system PROJ → forced to use rasterio's bundled `proj_data`.
- `load_stations` failed because the `station_id` column was not recognized.

### Experiments (production unchanged)
- 2016–2017 flood data added by the user (kelurahan-day events 1,529 → 2,558).
- Comparison of units (kelurahan/kecamatan/city), algorithms (XGBoost/logistic), and rainfall sources (Open-Meteo/IMERG/CHIRPS).
  Final decision: kecamatan + logistic + Open-Meteo. See TRAINING_RESULTS.md section 6.
- Evaluated scraping the BPBD/PPID dashboard for historical data: no history available; not pursued.

## Before changes (initial repository state)
- Per-kelurahan XGBoost pipeline with `audit_data`, `fetch_rainfall` (Open-Meteo), `build_static` (SRTM), `build_tma`,
  `build_dataset`, `train`, `predict`, `features`, `synthetic`, and 17 tests.
- `data/raw/flood/` held 5 flood files (2018–2020, 2023, 2024); `kelurahan_centroids.csv` and TMA data did not exist yet.
