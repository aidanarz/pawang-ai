# Pawang AI: Flood Prediction Engine

Predicts the **probability of flooding per kecamatan (sub-district) per day** from rainfall, elevation and (optionally)
water level. The main unit is kecamatan; kelurahan (urban village) or city level can be selected with `PAWANG_UNIT`.
The module is self-contained: the backend/agent only needs to call `FloodPredictor`.
The production model is a regularised **logistic regression**, not XGBoost. XGBoost was trained and compared on the same
data, scored about the same or worse, and remains selectable through `config.MODEL_ALGO`. The repository folder name
`pawang-xgboost` is historical (the project started with XGBoost).

```
src/
  config.py          paths, column-name aliases, parameters (edit here if your file columns differ)
  audit_data.py      STEP 0: check all raw inputs
  fetch_rainfall.py  download historical daily rainfall (Open-Meteo; optionally NASA IMERG / CHIRPS)
  fetch_tma.py       download water level (TMA) per year from the Satu Data API (large JSON, with retry) -> data/raw/tma/*.csv
  fetch_dem.py       download Copernicus DEM GLO-30 tiles (public AWS, no account) -> data/raw/dem/
  build_centroids.py kelurahan centroids from admin4 boundaries (HDX COD-AB, BPS) -> data/raw/kelurahan_centroids.csv
  build_static.py    elevation per kelurahan from the DEM (Copernicus/SRTM)
  build_tma.py       daily water-level summary per station
  build_dataset.py   assemble the training table (kelurahan x day, label 0/1), then aggregate to the prediction unit
  aggregate.py       kelurahan -> kecamatan/city aggregation (same rules for training and inference)
  train.py           train models (logistic/XGBoost), calibration, risk thresholds, evaluation
  cv.py              per-year cross-validation (python -m src.cv)
  linear_model.py    logistic regression stored as JSON
  predict.py         inference CONTRACT for the backend/agent
  features.py        feature definitions (used in training AND inference)
  synthetic.py       synthetic data for trials without real data
tests/               37 end-to-end tests (python -m pytest)
```

Project documents: [REPORT.md](REPORT.md) (full report) · [TRAINING_RESULTS.md](TRAINING_RESULTS.md) (training results) · [CHANGELOG.md](CHANGELOG.md).

## 1. Prepare the inputs (`data/raw/`)

| Location | Contents | Source |
|---|---|---|
| `flood/*.csv` | Flood events per year (multiple files allowed) | satudata.jakarta.go.id: Flood Disaster Event Data |
| `tma/*.csv` | Water level per station | satudata.jakarta.go.id: Water Level Data |
| `dem/*.tif` | DEM GeoTIFF tiles (EPSG:4326), several allowed | `python -m src.fetch_dem` (Copernicus GLO-30), or earthexplorer.usgs.gov |
| `kelurahan_centroids.csv` | `kelurahan, kecamatan, lat, lon` | `python -m src.build_centroids` (needs `data/external/idn_admin_boundaries.gdb.zip` from HDX `cod-ab-idn`, 219 MB; requires `pyogrio`, `shapely`) |
| `tma_stations.csv` | `station, lat, lon` per monitoring station | **you must provide it** if the TMA files contain no lat/lon |

Water level: `python -m src.fetch_tma` (2016-2020; tens to hundreds of MB per year, may take several minutes).
The raw unit in the API is **millimetres**; it is converted to cm in `build_tma` (`TMA_UNIT_DIVISOR`). Stations that were
renamed between years at the same coordinates are merged automatically. The 2023/2024 flood data have no daily dates and
are therefore skipped; flood dates for 2018-2020 are derived from `periode_data` + the day in `tanggal_kejadian`.

Alternative SRTM tiles for Jakarta: search for "SRTM 1 Arc-Second Global", area roughly lat -6.4..-5.9 and lon 106.6..107.1
(usually tiles S07E106 and S06E106; add E107 if Bekasi is needed).

Note: `kelurahan_centroids.csv` is a prerequisite. Without coordinates, rainfall and elevation cannot be matched to
kelurahan. Sources you can check: kelurahan boundaries from the Jakarta map portal or BIG (take the centroid), or
coordinates per `adm4` code from the BMKG API you have already tested.

## 2. Run (order)

```bash
pip install -r requirements.txt
python -m src.audit_data        # 0. check columns, dates, name matching; read the [BELUM SIAP] (not ready) messages
python -m src.fetch_rainfall    # 1. historical rainfall (needs internet; results are cached)
python -m src.build_static      # 2. elevation
python -m src.build_tma         # 3. daily water level (skip if there is no TMA data)
python -m src.build_dataset     # 4. training table (+ aggregation to config.UNIT)
python -m src.train             # 5. models -> models/ (algorithm: config.MODEL_ALGO)
python -m src.cv                # 5b. per-year cross-validation -> data/processed/cv_by_year.csv
python -m pytest                # optional: test the pipeline with synthetic data
```

Try without real data: `python -m src.synthetic`, then run steps 2-5 with
`PAWANG_DATA_DIR=data_demo PAWANG_MODELS_DIR=models_demo` in front of the command.

If your file columns differ from what is expected, `audit_data` tells you which columns exist. Add their names
to the aliases in `src/config.py`.

## 3. Definitions to agree on with the team

- **Prediction unit:** **kecamatan** x day (44 units; `config.UNIT` / env `PAWANG_UNIT` = `kecamatan|kelurahan|kota`).
  Flood data is recorded per kelurahan and then aggregated: the unit label = 1 if any kelurahan inside it flooded; rainfall,
  water-level and elevation features are averaged (minimum elevation = minimum). Reason: at kelurahan level prevalence is
  <1% and the signal is very weak; at kecamatan level (prevalence ~2-3%) the `high` threshold gives ~21% precision at ~60%
  recall (kelurahan: 8% at 68%). Discrimination ability (ROC-AUC ~0.8-0.9) does NOT improve; the output is only more
  useful operationally. Heatmap = colour per kecamatan.
- **Label:** 1 if the kelurahan was recorded as flooded on that day, 0 for all other days in years that have data.
  Incomplete recording means "0" is not necessarily "no flood".
- **Horizon:** determined by the *target day*. Rainfall features end on the target day; for "tomorrow",
  target day = tomorrow, and that day's rainfall is filled with a **forecast** while earlier days are observations.
- **Two models:** `rainfall_only` (rainfall + elevation) and `full` (+ water level). `mode="auto"` uses `full`
  for rows whose water-level features are complete and `rainfall_only` otherwise. The `full` model is trained only on days
  that have water-level data.

## 4. Inference contract (for the backend/agent)

```python
from src.predict import FloodPredictor
fp = FloodPredictor("models")

# A) features already per kecamatan (cell_id = kecamatan name, e.g. "menteng"):
df = fp.with_static(df)                    # add elevation from cell_id (unit)
out = fp.predict(df, mode="auto")          # cell_id, p_flood, risk_level, mode, model_version

# B) features per kelurahan (cell_id = "kecamatan|kelurahan"): aggregated to kecamatan automatically
kel = fp.with_static_kelurahan(kel)
out = fp.predict_from_kelurahan(kel)       # one row per kecamatan
```
`fp.unit` gives the model's unit ("kecamatan"). Kecamatan/kelurahan `cell_id` keys use `norm_name` (lower case, without the "kec."/"kel." prefix).

Input `df`: one row per prediction unit for one target day, column `cell_id` + the features in
`models/<mode>.meta.json["features"]`.

| Feature | How to build it at inference time |
|---|---|
| `rain_d0` ... `wet_days_7d`, `month_*` | `src.features.rain_features(daily)` from a daily rainfall series (columns `point_id, date, precip_mm`) whose **last day is the target day** |
| `elev_*` | `fp.with_static(df)` |
| `tma_max`, `tma_delta1`, `tma_max_3d` | daily maximum water level (cm) of the nearest station (`fp.cell_station`) and its derivatives |
| `tma_pct` | `fp.tma_percentile(station_ids, tma_max)` |

`strict=True` (default): rows with incomplete features raise `ValueError`; the model never
guesses. `strict=False`: such rows are returned with `risk_level="unknown"`, `p_flood=NaN`.

The `point_id` for each kelurahan is in `models/static_features_kelurahan.csv`. One rainfall point serves all
kelurahan in the same 0.1-degree grid cell.

## 5. How to read the results

- `p_flood` is the **per-unit, per-day** probability and is calibrated, so its values are small
  (daily flood prevalence is typically only a few percent or less). For heatmap colours, use
  `risk_level` or a threshold-based scale, not a raw 0-100% scale.
- The `medium` threshold is chosen so that recall >= 90% on the validation data (`RECALL_TARGET_MEDIUM` in `config.py`).
  As a consequence the "medium" band can be very wide with low precision. Lower the recall target if
  too many areas are coloured medium.
- The model is **not retrained on train+val**, so that the calibrator and thresholds stay valid.
- `models/<mode>.meta.json` holds val/test metrics, baselines and feature importance (for logistic: |standardised
  coefficient|). Two baselines are stored: the 3-day rainfall ranking, and a logistic regression with `C=1`. Because the
  production model is itself a logistic regression, the second baseline is nearly identical to it by construction; the
  3-day rainfall ranking is the informative one to beat.

- **Algorithm** is selected in `config.MODEL_ALGO` (`logistic` by default, or `xgboost`). On the real data the two are
  almost equivalent (mean per-year CV PR-AUC ~0.02-0.07; weak signal), so logistic was chosen because it is simpler and
  better on the forward split (train 2016-2018, test 2020). `lat/lon` is switched off (`USE_LATLON=False`).
  Why logistic and not XGBoost: logistic regression adds up weighted features into one score (a straight-line rule), while
  XGBoost builds many small decision trees that can capture interactions. With only ~2,500 flood events, weak signal and
  just five years, trees have little extra pattern to find and mostly fit noise; the simple rule scored equal or better
  on the forward test, varies less, and its weights can be read and stored as small JSON. It is not "better" in general:
  with more years of cleaner data XGBoost may win and should be re-tested (`MODEL_ALGO="xgboost"`, then `python -m src.cv`).
- **Calibration** uses a sigmoid (`config.CALIBRATION`). Isotonic was dropped: on rare flood data it collapses
  the scores into a few dozen tied values and lowers PR-AUC by 2-3x.
- **Rainfall source** (`PAWANG_RAIN_SOURCE`): `openmeteo` (default, reanalysis) or `imerg` (NASA GPM IMERG Final V07,
  needs `EARTHDATA_TOKEN` in `.env` and approval of the "NASA GESDISC DATA ARCHIVE" application in the Earthdata account).
  At kecamatan level, IMERG raises the rainfall-only model's PR-AUC from 0.13 to 0.22 (test 2020) and the CV ROC-AUC from
  0.74 to 0.77; with water level the difference is small. IMERG model:
  `PAWANG_RAIN_SOURCE=imerg PAWANG_MODELS_DIR=models_imerg python -m src.train`.
  IMPORTANT: a model trained with IMERG must be given IMERG rainfall features at inference (Late Run, latency ~14 hours;
  the Final Run is published only ~3.5 months later). An IMERG day is a UTC day, not WIB.

## 6. Known limitations

- **Training and inference rainfall come from different sources.** Training uses Open-Meteo reanalysis; inference will use
  a forecast (BMKG or Open-Meteo forecast). Measure the difference. Using Open-Meteo forecast with `past_days`
  for inference keeps the source the same.
- **Water-level features come from the Dinas SDA monitoring stations**, not Google Flood Hub. The `full` model is only valid if
  the same station data is available at inference (unit cm, same stations).
- Open-Meteo rainfall has a resolution of about 10 km, so kelurahan in the same grid cell share the same rainfall value.
- `tma_pct` uses the distribution of each station's whole history (without labels), a mild leakage that can be ignored.
- There is no distance-to-river feature yet (not part of the chosen data sources) and no historical flood frequency
  per kelurahan. Both are candidates for future improvement.
