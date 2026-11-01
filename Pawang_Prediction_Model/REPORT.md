# Full Report — Pawang AI Flood Prediction Engine (logistic regression, per kecamatan)

> The production model is a **logistic regression**. The project began with XGBoost (hence the folder name
> `pawang-xgboost`); XGBoost was evaluated throughout, did not beat logistic, and is kept as a selectable option.

Report date: 2026-10-27 · Detailed numbers: [TRAINING_RESULTS.md](TRAINING_RESULTS.md) · Changes: [CHANGELOG.md](CHANGELOG.md)
· Usage guide: [README.md](README.md)

Terminology: *kecamatan* = sub-district (44 in Jakarta); *kelurahan* = urban village (264 used here); *TMA* (tinggi muka air)
= water level; *Siaga 1–3* = official alert levels at water gates.

## 1. Executive summary

- **What was built:** a complete pipeline from raw data (flood events, water level, DEM, rainfall) to models and an
  inference contract. The main prediction unit is the **kecamatan** (44 units) per day, with two models: `rainfall_only`
  (rainfall + elevation) and `full` (+ water level/TMA).
- **How good it is:** on the 2020 test year, PR-AUC **0.132** (rainfall only) and **0.286** (`full`), ROC-AUC **0.79** and
  **0.88**, versus a random-guess PR-AUC of 0.03. At the `high` threshold, the `full` model catches 60% of events with 21% precision.
- **How far it can be trusted:** moderate to low. There is only one forward test year (2020, an extreme year). In per-year
  cross-validation the mean ROC-AUC is 0.74 (rainfall only) and 0.75 (`full`), and ordinary years are much weaker than 2020.
  The model is suitable for a **relative alert ranking**, but not yet for pinpointing which kecamatan will definitely flood.
- **The biggest limit is the data, not the algorithm:** flood labels are incomplete, rainfall is coarse (~10 km), water level
  is only sufficient for 2018–2020, and only five years of daily labels exist.
- **Decisions taken together:** kecamatan as the main view; logistic as the algorithm; Open-Meteo kept as the rainfall source;
  training uses only the data currently available (no extra scraped data).

## 2. Goal and scope

Predict the **probability of flooding per area unit per day** from rainfall, elevation and water level, in a self-contained
module: the backend/agent only needs to call `FloodPredictor`. Out of scope: flood-depth prediction, the rainfall forecast
itself, and a real-time data collector (not built yet).

## 3. Data

| Source | Contents | How obtained | Used |
|---|---|---|---|
| Flood events 2016–2020 | per kelurahan, event date | `.xls` files (actually HTML) from Satu Data Jakarta | yes |
| Flood events 2023–2024 | **monthly** summary, no dates | same | no (daily labels cannot be built) |
| Disaster events 2021 | 88 floods, 82 of them in February 2021 (looks like one large event starting 20 Feb) | Satu Data API | no (year looks incomplete) |
| Water level 2016–2020 | hourly/minute readings, 42 station names | Satu Data API (`fetch_tma.py`) | yes |
| Copernicus GLO-30 DEM | tiles S07E106 and S06E106, 30 m | public AWS (`fetch_dem.py`) | yes |
| Kelurahan centroids | 264 kelurahan | HDX COD-AB Indonesia admin4, BPS (`build_centroids.py`) | yes |
| Daily rainfall | 12 grid points of 0.1°, 2015-12-02..2020-12-31 | Open-Meteo (`fetch_rainfall.py`) | yes |
| IMERG / CHIRPS rainfall | alternatives | NASA GES DISC / CHC | no (see section 6) |

### 3.1 Cleaning that was required (all coded and tested)

| Problem in the raw data | Handling |
|---|---|
| `.xls` files are really HTML | `read_table` detects the content and uses `read_html` |
| Flood dates without month/year (`TGL. 15, 16`), 0% parsed in 2018–2019 | the parser uses `periode_data` + a list of days; supports ranges (`05 s/d 07`), month names and year rollover |
| Rows without a valid day | 69 rows (blank in the source) are reported and dropped |
| Water level is in **millimetres**, not cm | divided by 10 (`TMA_UNIT_DIVISOR`); proven from the Siaga thresholds (Manggarai Siaga 3 starts at 7,500 = 750 cm) |
| Broken station coordinates (`-6.197.901`) | the decimal point is re-inserted |
| Exact zeros, sensor spikes (up to 536,650), wrong sensor clocks (years 2005/2032) | zeros treated as missing; spikes > 3x the station's 99.5th percentile dropped; the date must be within ±1 month of `periode_data` |
| Stations renamed at the same coordinates | 42 names merged into 24 physical stations (distance ≤ 150 m) + typo fixes |
| Different kelurahan spellings (`Bale Kambang`/`balekambang`) | space-insensitive matching, fuzzy kecamatan, unique-token matching |

Matching of flood kelurahan names to centroids: **99.2%** of rows (the rest are Kepulauan Seribu, which is out of scope, and a few
rows with errors in the source data). Of the 2,558 kelurahan-day events, the kecamatan unit label = 1 if any kelurahan inside it flooded.

### 3.2 Data quality to be aware of

- **Labels are incomplete.** Days without a record are treated as 0; some may be unreported floods.
- **Water-level coverage is low in 2016–2017** (9% and 20% of kecamatan-days), so the `full` model is effectively trained on 2018–2019.
- **The water-level datum shifts when a station is renamed** (Katulampa median 350 → 190 mm; Cibalok and Pluit too), which affects `tma_pct`.
- **October 2019 anomaly:** 361 rows in the "2020" file are labelled `periode_data=201910` with the text `OKTOBER` and no year. The pipeline
  follows `periode_data`; if that is a typo for 2020, the labels are shifted by a year.

## 4. Pipeline architecture

```
fetch_tma ─┐                                    ┌─ fetch_rainfall (Open-Meteo)
           ├─ build_tma ─ tma_daily ─┐          │
fetch_dem ─┴─ build_static ─ elevation ┼─ build_dataset ─ kelurahan table ─ aggregate ─ kecamatan table ─ train ─ models/
build_centroids ─ centroids ─────────┤          │                                                       └─ cv
flood data ─ flood.py ───────────────┘──────────┘
                                                        predict.py (FloodPredictor) ← backend/agent
```

Principles maintained: features are computed by the same functions for training and inference (`features.py`); time-based
splits (not random); the model is not retrained on train+val so the calibrator and thresholds stay valid; the model never
guesses (rows with incomplete features raise an error or return `unknown`).

## 5. Design decisions and rationale

| Decision | Rationale | Evidence |
|---|---|---|
| **Kecamatan** unit | kelurahan prevalence <1% makes the signal very weak; kecamatan is ~2–3% | `high` precision at similar recall: 8% (kelurahan) → 21% (kecamatan); ROC-AUC unchanged |
| **Logistic regression** | XGBoost does not consistently beat it; it is simpler and more stable | forward split 2020: logistic ≥ XGBoost; CV: the difference is smaller than the year-to-year variation |
| **Sigmoid** calibration | isotonic produces tied scores that lower PR-AUC by 2–3x | 68 thousand scores → 16–35 unique values under isotonic |
| **No `lat/lon`** | does not generalise across years with little data | did not help; dropped so the model does not memorise locations |
| **Open-Meteo** rainfall | one provider for both training and forecast; IMERG Final is not real-time and has no forecast | see section 6 |
| Train on the data as is | scraping provides no history; 2021 data is incomplete | section 7 |

## 6. Rainfall-source experiments

- **CHIRPS** (0.05°): the server answered HTTP 403 after parallel requests (8 threads, thousands of days); only 6.6% of days were read.
  Not evaluated. As a result, rejection of gappy caches was added, plus a hard error when > 2% of days fail.
- **IMERG Final V07** (NASA, 0.1°): fully downloaded through OPeNDAP with an Earthdata token. At kecamatan level the rainfall-only model
  rose from PR-AUC 0.132 to 0.224 (test 2020) and CV ROC-AUC 0.737 → 0.766; for the `full` model it barely changed
  (0.286 → 0.332 in 2020, CV the same). Decision: **stay with Open-Meteo**, because IMERG is observation only (no forecast),
  the Final Run is published ~3.5 months later, the Late Run (~14 h) has not been tested, and an IMERG day is a UTC day. The candidate is kept in
  `models_imerg/`.

## 7. Additional data and scraping (evaluated, not carried out)

- The endpoint in the example script (`bpbd.jakarta.go.id/waterlevel/getWaterLevel`) returns 404.
- The real BPBD dashboard (`/waterlevel`, `POST /api/charttma`) only returns an hourly series for the **current day** per station,
  with no history; its value is as a prospective archive and as a live water-level source for inference.
- The dashboard unit appears to be cm (Siaga thresholds 200/150/80) while the Satu Data archive is in mm; this must be verified before use.
- The more promising historical route: an official BPBD data request (`bpbd.jakarta.go.id/permohonan-data`).
- Current decision: train only on the data already available.

## 8. Summary of results (details in TRAINING_RESULTS.md)

| Production model, test 2020 | PR-AUC | ROC-AUC | `high`: recall / precision |
|---|---|---|---|
| `rainfall_only` | 0.132 | 0.792 | 0.485 / 0.096 |
| `full` | 0.286 | 0.884 | 0.603 / 0.212 |
| Per-year CV, mean | 0.067 / 0.143 | 0.737 / 0.753 | — |

## 9. Key findings and risks

1. **The 2020 test is too optimistic.** 2020 was an extreme year; the 2019 validation and the 2019 CV fold reach only ROC 0.59–0.65.
2. **The `medium` threshold is barely informative** (90–96% of unit-days). On an extreme day, 44 of 44 kecamatan are labelled `high`
   (25 Feb 2020, when 40 kecamatan really did flood). Lowering `RECALL_TARGET_MEDIUM` to ~0.6 shrinks the medium band
   to about 57% of unit-days with a test recall of 0.96 (2020 result; not applied, a product decision).
3. **The training-vs-inference mismatch has not been measured.** Training uses reanalysis; production will use a forecast.
4. **The `full` model needs live water level** (same stations and unit as in training). No collector exists yet.
5. **Static features act as a kecamatan identity**; the positive sign of `elev_min` contradicts physical intuition.
6. **Known mild leakage:** `tma_pct` uses the distribution of each station's whole history.
7. **Environment:** rasterio on this machine conflicts with the PROJ shipped with PostgreSQL/PostGIS; handled automatically in
   `src/geo.py`. The environment is in `.venv/`.
8. **Security:** the Earthdata token is in `.env` (never printed by the code). The project is not a git repository; if it becomes one,
   add `.env` to `.gitignore`. The token can be revoked in the Earthdata profile if IMERG is no longer used.

## 10. Inference contract

```python
from src.predict import FloodPredictor
fp = FloodPredictor("models")          # fp.unit == "kecamatan"

# A) features already per kecamatan (cell_id = kecamatan name, e.g. "menteng")
out = fp.predict(fp.with_static(df), mode="auto")
# B) features per kelurahan (cell_id = "kecamatan|kelurahan"): aggregated automatically
out = fp.predict_from_kelurahan(fp.with_static_kelurahan(kel))
```

Output: `cell_id`, `p_flood` (calibrated; small because prevalence is low), `risk_level` (low/medium/high/unknown),
`mode`, `model_version`. For heatmap colours use `risk_level`, not a 0–100% scale. Parity is tested: predictions from
kelurahan features are identical to predictions from the kecamatan table (44 kecamatan, 25 Feb 2020).

## 11. Recommendations and next steps

| Priority | Step | Reason |
|---|---|---|
| 1 | Submit an official BPBD data request (hourly water level and daily flood events 2021–present) | the only route that closes the historical gap; biggest effect on stability |
| 2 | Build a live water-level collector (low rate; store raw value + unit + Siaga thresholds) | needed for `full` model inference; also builds an archive |
| 3 | Decide on `RECALL_TARGET_MEDIUM` (e.g. 0.6) or rank-based labelling per day | the medium band is currently almost always on |
| 4 | Measure the difference between Open-Meteo reanalysis and forecast rainfall on the same days | the largest mismatch that is still unmeasured |
| 5 | Robustness test: change the validation/test year (e.g. test 2019) and see how the thresholds move | assess threshold stability |
| 6 | Validate with BPBD experts: is the kecamatan ranking sensible on real events | statistical metrics alone cannot assess usefulness |

## 12. Generated files

| File / folder | Contents |
|---|---|
| `models/` | production model (kecamatan, logistic, Open-Meteo): `*.linear.json`, `*.meta.json`, static features, unit map, TMA reference |
| `models_imerg/` | IMERG candidate (not used) |
| `data/processed/` | training tables (kelurahan, kecamatan, city, IMERG variants), `cv_by_year.csv`, `compare_*.csv`, `dataset_report.json` |
| `data/raw/`, `data/interim/` | raw data and intermediate results, including the IMERG/CHIRPS rainfall caches (CHIRPS is gappy and unused) |
| `TRAINING_RESULTS.md`, `CHANGELOG.md`, `REPORT.md` | these documents |
