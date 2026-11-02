# Test Plan — Pawang AI Flood Prediction Model

Scope: the data pipeline, training, and inference code in `src/`, plus the trained models in `models/`.
Companion documents: [TRAINING_RESULTS.md](TRAINING_RESULTS.md) (current numbers), [CHANGELOG.md](CHANGELOG.md), [README.md](README.md).

Status legend: **Done** = automated test exists in `tests/`; **Planned** = not yet written; **Manual** = run by a person and recorded.

## 1. Objectives

1. Prove the pipeline runs end to end and produces the same features at training and at inference.
2. Prove the model ranks flood risk better than simple baselines, and that this holds across years, not only on 2020.
3. Prove the inference contract (`FloodPredictor`) is safe for the backend: it never guesses values, and it fails loudly on bad input.
4. Detect regressions when data, code, or hyperparameters change.

Out of scope: the frontend (`frontend/`), the Open-Meteo / NASA / Satu Data servers themselves, and operational evaluation against real-time forecasts (see risk R7).

## 2. System under test

| Stage | Modules | Output |
|---|---|---|
| Ingest | `fetch_tma`, `fetch_dem`, `fetch_rainfall`, `fetch_imerg`, `fetch_chirps`, `build_centroids` | raw files in `data/raw`, `data/interim` |
| Parse and clean | `flood`, `build_tma`, `build_static`, `utils` (`parse_dates`, `match_cells`) | daily TMA, static features, flood labels |
| Features and dataset | `features`, `aggregate`, `build_dataset` | `data/processed/train_table*.parquet` (kecamatan: 80,388 rows, 44 units) |
| Train and evaluate | `train`, `linear_model`, `calibration`, `cv` | `models/*.meta.json`, `*.linear.json`, `cv_by_year.csv` |
| Inference | `predict.FloodPredictor` | `cell_id`, `p_flood`, `risk_level`, `mode`, `model_version` |

Production configuration under test: kecamatan unit, logistic regression (`C = 0.01`), sigmoid calibration, Open-Meteo rainfall, two models (`rainfall_only`, `full`). XGBoost stays in scope as an alternative algorithm.

## 3. Test levels and current coverage

Run with `python -m pytest` (37 tests at the time of writing). All integration tests use synthetic data from `src/synthetic.py`, so they need no network and no raw data.

| Level | What it checks | Existing tests | Status |
|---|---|---|---|
| Unit: parsing | date formats, name normalization, flood date expansion, coordinate fixes | `test_parse_dates_mixed_formats`, `test_norm_name_strips_prefixes`, `test_expand_flood_dates`, `test_coord_fix` | Done |
| Unit: features | rainfall windows, TMA percentile and delta | `test_rain_features_windows_are_correct`, `test_tma_features_percentile_and_delta`, `test_tma_percentile_helper_matches_training_table` | Done |
| Unit: models | JSON round-trip, calibration keeps ranking, aggregation rules | `test_linear_model_json_roundtrip`, `test_sigmoid_calibration_keeps_ranking`, `test_aggregate_rules` | Done |
| Unit: real file formats | HTML disguised as `.xls`, TMA unit conversion, station rename, outlier removal | `test_read_html_xls`, `test_build_tma_units_rename_and_outliers` | Done |
| Integration: data | name matching, dataset shape and labels, audit | `test_name_matching_handles_messy_names`, `test_dataset_shape_and_labels`, `test_audit_runs_without_error` | Done |
| Integration: training | chronological split, learns above chance, both algorithms save and load, kecamatan files | `test_split_is_chronological`, `test_models_learn_signal_beyond_chance`, `test_both_algos_train_save_and_predict`, `test_default_unit_is_kecamatan`, `test_kecamatan_models_and_files` | Done |
| Contract: inference | output schema, per-row fallback, rejection of incomplete input, parity with training | `test_predict_contract`, `test_predict_falls_back_per_row_when_tma_missing`, `test_predict_rejects_incomplete_input`, `test_predict_matches_training_pipeline`, `test_training_inference_feature_parity`, `test_predict_from_kelurahan_matches_unit_table`, `test_to_units_rejects_unknown_cells` | Done |
| Behavioral | heavy rain raises risk in lowland | `test_heavy_rain_raises_risk_in_lowland` | Done |
| External API parsing | Open-Meteo response parsing (mocked) | `test_open_meteo_response_parsing` | Done |

## 4. Gaps and planned tests

Priority: **P1** = needed before the model is used for decisions, **P2** = next iteration, **P3** = nice to have.

### 4.1 Data validation

| ID | Test | Acceptance criterion | Pri | Status |
|---|---|---|---|---|
| D1 | Run `audit_data` on the real data and fail on schema drift | Required columns present; flood date parse rate per year is reported and ≥ 95% for 2016–2020 | P1 | Planned |
| D2 | Label sanity on the real kecamatan table | Positives per year match section 2 of TRAINING_RESULTS (410 / 292 / 170 / 258 / 472) after a rebuild | P1 | Planned |
| D3 | Rainfall cache completeness | A cache with > 2% missing days is rejected (rule exists in code; add a test with a gappy fixture) | P1 | Planned |
| D4 | TMA coverage by year is recorded and stable | Coverage per year within ±2 points of 9.1 / 19.9 / 63.9 / 84.9 / 82.7% unless the data was intentionally changed | P2 | Planned |
| D5 | No duplicate `(cell_id, date)` rows; date range is contiguous (1,827 days) | 0 duplicates, 0 gaps | P1 | Planned |
| D6 | Files without a date column (flood 2023 and 2024) are skipped with a warning | Warning emitted; no crash; no rows from those files | P2 | Planned |
| D7 | Time zone convention | Open-Meteo day = WIB day; if IMERG or CHIRPS is used, the UTC shift is documented and tested on a fixture | P3 | Planned |

### 4.2 Model quality (offline evaluation)

These tests run on real data and are **Manual** or a scheduled job, not part of the fast unit suite.

| ID | Check | Method | Acceptance criterion (proposed) | Pri | Status |
|---|---|---|---|---|---|
| M1 | Beats random | PR-AUC vs prevalence on each CV fold | PR-AUC ≥ 2× prevalence on every fold; current mean lift is ≈ 3.4× (`rainfall_only`) and ≈ 7.8× (`full`) | P1 | Manual |
| M2 | Beats simple baseline | Compare with the 3-day rainfall ranking | Model PR-AUC > baseline on the test year (2020: 0.132 vs 0.108, and 0.286 vs 0.118 for `full`) | P1 | Manual |
| M3 | Ranking quality | ROC-AUC per fold | Mean CV ROC-AUC ≥ 0.70; no fold below 0.55. Current: 0.737 and 0.753, worst fold 0.587 (2019 `full`) | P1 | Manual |
| M4 | Stability across years | `python -m src.cv` → `cv_by_year.csv` | Report mean, min, max per metric. Do not report the 2020 test alone, because 2020 is an extreme year | P1 | Manual |
| M5 | Probability calibration | Brier score and reliability table (decile bins) on the validation and test years | Brier ≤ prevalence-only Brier; mean predicted probability within 2× of observed prevalence per year | P1 | Planned |
| M6 | Threshold stability | Re-pick `medium` and `high` thresholds using a different validation year | Report the shift. Flag if the `high` threshold moves by more than 2× (known weakness R2) | P2 | Planned |
| M7 | Per-unit performance | PR-AUC and recall per kecamatan | List units with recall < 0.3 at `high`. Report only, no hard gate (few events per unit) | P2 | Planned |
| M8 | Extreme-day behavior | Evaluate on days with the highest rainfall (for example 25 Feb 2020) | Report how many of 44 units are `high` (known: all 44). Track the fraction of unit-days flagged `medium` (known: 90–96%) | P2 | Planned |
| M9 | Ablation | `rainfall_only` vs `full` on identical rows | `full` ≥ `rainfall_only` on the same rows (current 0.286 vs 0.134) | P2 | Manual |
| M10 | Algorithm comparison | Logistic vs XGBoost with the same split | Production algorithm must not be worse than the alternative by more than 0.03 mean CV PR-AUC, or the choice is revisited | P2 | Manual |
| M11 | Leakage check | Shuffle labels within each year and retrain | PR-AUC collapses to about prevalence. Also confirm no feature uses data after the target day | P1 | Planned |
| M12 | Sensitivity to missing labels | Randomly drop 20% of positives and retrain | Metrics degrade gracefully (documented), because unreported floods are labelled 0 (risk R5) | P3 | Planned |

Validation protocol: chronological split only (train 2016–2018, validation 2019, test 2020) plus leave-one-year-out CV. Never random-split days, because neighboring days and neighboring kecamatan are correlated. The CV folds use future years to predict the past, so they measure stability, not forecasting skill.

### 4.3 Inference contract

| ID | Test | Acceptance criterion | Pri | Status |
|---|---|---|---|---|
| I1 | `p_flood` bounds and types | All values in [0, 1] or NaN; `risk_level` in {low, medium, high, unknown} | P1 | Done (`test_predict_contract`) |
| I2 | Threshold ordering and boundaries | `p` exactly at `medium` and `high` thresholds maps to the higher class (`>=`) | P1 | Planned |
| I3 | Monotonicity | Increasing `rain_d0` with everything else fixed never lowers `p_flood` for the logistic model | P2 | Planned |
| I4 | Idempotence and determinism | Same input twice gives identical output; row order does not change per-row results | P1 | Planned |
| I5 | `strict=False` | Incomplete rows return `p_flood = NaN`, `risk_level = "unknown"`, other rows unaffected | P1 | Partly done |
| I6 | `mode="auto"` fallback | Uses `full` only when all four TMA features are present, otherwise `rainfall_only`, and records `mode` per row | P1 | Done |
| I7 | Model files vs `meta.json` | Loader picks the file from `meta.json` (`algo`); a missing model file for a listed mode is skipped without crashing; no models at all raises `FileNotFoundError` | P1 | Planned |
| I8 | Unknown `cell_id` | `to_units` raises `ValueError` listing examples | P1 | Done |
| I9 | CLI | `python -m src.predict --input x.csv --output y.csv` round trip, including `--lenient` | P2 | Planned |
| I10 | Latency | One day of 44 units scores in under 1 second after load; `predict_flood_grid` (reloads each call) under 2 seconds | P3 | Planned |

### 4.4 Robustness and failure handling

| ID | Scenario | Expected behavior | Pri | Status |
|---|---|---|---|---|
| F1 | Rainfall far above the training maximum | Probability stays in [0, 1], increases monotonically, no NaN | P2 | Planned |
| F2 | All-zero rainfall | Low risk for every unit; no exception | P2 | Planned |
| F3 | TMA station renamed (datum shift, for example Katulampa 350 → 190 mm) | `tma_pct` stays in [0, 1]; a warning is logged for large jumps (risk R9) | P2 | Planned |
| F4 | TMA spike above 3× the 99.5th percentile | Dropped by `build_tma` | P1 | Done |
| F5 | HTTP 401 / 403 / 429 from IMERG or CHIRPS | Download stops cleanly and the resumable cache is kept | P2 | Planned (mock server) |
| F6 | Corrupt or truncated JSON from Satu Data | Rejected by validation, retried, never written as a partial file | P2 | Planned |
| F7 | `.env` missing | Pipeline runs with Open-Meteo; IMERG raises a clear message; no secret is printed | P2 | Planned |
| F8 | Stale model files after switching algorithm | `train.run` removes other-algorithm files (changelog 2026-10-27); add a test | P2 | Planned |

### 4.5 Regression and release gate

Before a new model replaces the one in `models/`:

1. `python -m pytest` passes in full.
2. Rebuild and retrain: `python -m src.build_dataset`, `python -m src.train`, `python -m src.cv`.
3. Compare the new `meta.json` and `cv_by_year.csv` against the committed ones. Planned automation `tests/test_regression.py`:
   - mean CV PR-AUC and ROC-AUC drop by no more than 0.02 and 0.02, unless the change is documented in the CHANGELOG;
   - feature list and order unchanged, or `model_version` bumped and noted;
   - thresholds satisfy `medium < high`.
4. Update `TRAINING_RESULTS.md` and `CHANGELOG.md` in the same change.
5. Never commit `.env`, `.venv/`, or raw data (> 100 MB files are rejected by GitHub).

## 5. Test data

| Data | Use | Source |
|---|---|---|
| Synthetic | Unit and integration tests; deterministic and offline | `src/synthetic.py` (fixtures `env`, `env_kec`) |
| Small hand-built fixtures | Parsers and edge cases | inline in tests, `tmp_path` |
| Real data | Offline model evaluation (section 4.2) and data validation | `data/raw`, `data/processed` (not in git); rebuild with the fetch scripts |

Caveat: on synthetic data the labels come from a logistic formula, so logistic can beat XGBoost there. Synthetic tests prove the plumbing, not model quality. Model quality claims must come from real data (section 4.2).

## 6. Environment and tooling

- Python 3.12, dependencies in `requirements.txt`, virtualenv `.venv`; `pytest.ini` sets `pythonpath = .` and `testpaths = tests`.
- Network is not required for the unit and integration suite. Fetch scripts need internet; IMERG needs `EARTHDATA_TOKEN` in `.env`.
- Known environment issue: PROJ conflicts with PostgreSQL/PostGIS; `geo.fix_proj_env()` must run before reading rasters.
- Planned CI (GitHub Actions): on every push run `python -m pytest`; fail on any test failure. Model evaluation (section 4.2) is a manual or scheduled job because it needs the real data.

## 7. Risks and known limits that tests must keep visible

| ID | Risk (from TRAINING_RESULTS section 8) | Test or report that tracks it |
|---|---|---|
| R1 | Only one forward year (2020), and it is extreme | M4 reports all folds, not just 2020 |
| R2 | Thresholds chosen on the weak 2019 validation | M6 |
| R3 | `medium` is almost always on; all 44 units `high` on extreme days | M8 |
| R4 | Low precision (10% rainfall only, 21% `full` at `high`) | M1, M2; report precision with every recall number |
| R5 | Labels incomplete: days without a record are labelled 0 | M12 |
| R6 | `full` trained on 2018–2019 only; 3 CV folds | M3 uses the available folds and states the count |
| R7 | Training rainfall is reanalysis; inference will use forecasts | Manual: once forecast archives are available, score the same days with both and compare. Not yet measurable |
| R8 | Static features act as a kecamatan identity; `elev_min` sign contradicts physics | M7 and I3 for rainfall features; do not test coefficient signs of correlated features |
| R9 | TMA datum shifts when stations are renamed | F3 |

## 8. Exit criteria

The model is ready to be used by the backend when:

1. All **P1** tests above are either Done or have a recorded Manual result.
2. M1–M3 and M11 pass the stated criteria on the current data.
3. The inference contract tests (I1, I2, I4–I8) pass.
4. `TRAINING_RESULTS.md` states the CV mean and range for every reported metric, together with the limits in section 7.

## 9. Maintenance

Update this plan when a model, unit, or data source changes. Move rows from Planned to Done as tests are written, and record the commit that added each test in the CHANGELOG.
