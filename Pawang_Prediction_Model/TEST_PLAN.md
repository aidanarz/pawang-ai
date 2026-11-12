# Test Plan: Pawang AI Flood Prediction Model

## 1. Objectives

1. The pipeline runs end to end, and features match between training and inference.
2. The model ranks flood risk better than simple baselines, across years and not only 2020.
3. Inference is safe for the backend: it never guesses missing values and fails loudly on bad input.
4. Changes to data, code, or hyperparameters do not silently degrade the model.


## 2. Scope under test

| Stage | Modules |
|---|---|
| Ingest and clean | `fetch_*`, `flood`, `build_tma`, `build_static`, `utils` |
| Features and dataset | `features`, `aggregate`, `build_dataset` |
| Train and evaluate | `train`, `linear_model`, `calibration`, `cv` |
| Inference | `predict.FloodPredictor` |

Production setup: kecamatan unit (44), logistic regression (`C = 0.01`), sigmoid calibration, Open-Meteo rainfall, models `rainfall_only` and `full`.

## 3. Test levels

| Level | Focus | Status |
|---|---|---|
| Unit | date and name parsing, rain and TMA features, JSON round-trip, calibration, aggregation | Done |
| Integration | synthetic data -> dataset -> train - > predict, chronological split, both algorithms | Done |
| Contract | output schema, per-row fallback, reject incomplete input, training/inference parity | Done |
| Data validation (real data) | schema, label counts, coverage, duplicates | Done 2026-11-09: 3 pass, 2 fail (D3, D4) |
| Model evaluation (real data) | CV, baselines, calibration, leakage | Done 2026-11-09: all pass; M6 reported |
| Robustness | extreme rain, TMA datum shift, API errors | Done 2026-11-09: 2 pass, 1 fail (F2) |

37 automated tests exist (`python -m pytest`, no network needed, synthetic data from `src/synthetic.py`). Synthetic data proves the plumbing only, not model quality.

The real-data tests above run with `python tests/run_test_plan.py` (about 1 minute, works on a temporary copy of `data/`) and write
[TEST_RESULTS.md](TEST_RESULTS.md). The project-wide report is [../TEST_REPORT.md](../TEST_REPORT.md).

## 4. Key tests and acceptance criteria

Priority: **P1** before the backend uses the model, **P2** next iteration.

### 4.1 Data validation

| ID | Test | Pass criterion | Pri |
|---|---|---|---|
| D1 | Positives per year after rebuild | 410 / 292 / 170 / 258 / 472 (2016–2020) | P1 |
| D2 | No duplicate `(cell_id, date)`; 1,827 contiguous days | 0 duplicates, 0 gaps | P1 |
| D3 | Gappy rainfall cache | Rejected when more than 2% of days missing | P1 |
| D4 | Flood date parse rate (`audit_data`) | At least 95% per year, 2016–2020 | P2 |

### 4.2 Model quality (real data)

| ID | Test | Pass criterion (proposed) | Pri |
|---|---|---|---|
| M1 | Beats random | PR-AUC ≥ 2× prevalence on every CV fold | P1 |
| M2 | Beats rainfall baseline | PR-AUC above 3-day rainfall ranking (2020: 0.132 vs 0.108) | P1 |
| M3 | Stable across years | Mean CV ROC-AUC ≥ 0.70, no fold below 0.55 | P1 |
| M4 | Leakage check | Shuffle labels per year -> PR-AUC falls to about prevalence | P1 |
| M5 | Calibration | Brier ≤ prevalence-only Brier; reliability table by decile | P1 |
| M6 | Threshold stability | Report shift when the validation year changes | P2 |
| M7 | Algorithm comparison | Logistic not worse than XGBoost by more than 0.03 mean CV PR-AUC | P2 |

Protocol: chronological split (train 2016–2018, validation 2019, test 2020) plus leave-one-year-out CV (`python -m src.cv`). Never split randomly: neighboring days and districts are correlated. Always report the mean and range over all folds, not 2020 alone.

### 4.3 Inference and robustness

| ID | Test | Pass criterion | Pri |
|---|---|---|---|
| I1 | Output bounds | `p_flood` in [0, 1] or NaN; `risk_level` in low/medium/high/unknown | P1 |
| I2 | Threshold boundary | `p` equal to a threshold maps to the higher class | P1 |
| I3 | Determinism | Same input -> same output; row order does not matter | P1 |
| I4 | `strict=False` | Incomplete rows -> NaN and `unknown`; other rows unaffected | P1 |
| I5 | Model files vs `meta.json` | Loader follows `algo`; no models -> `FileNotFoundError` | P1 |
| F1 | Rainfall above training maximum | Probability stays in [0, 1], non-decreasing | P2 |
| F2 | TMA station rename (datum shift) | `tma_pct` stays in [0, 1], warning on large jump | P2 |
| F3 | IMERG/CHIRPS HTTP 401/403/429 | Download stops cleanly, cache kept | P2 |

## 5. Release gate (before replacing `models/`)

1. `python -m pytest` passes.
2. Rebuild: `python -m src.build_dataset`, `python -m src.train`, `python -m src.cv`.
3. Compare with the previous `meta.json` and `cv_by_year.csv`: mean CV PR-AUC and ROC-AUC drop by at most 0.02, unless documented.
4. Update `TRAINING_RESULTS.md` and `CHANGELOG.md` in the same change.
5. Never commit `.env`, `.venv/`, or raw data (GitHub rejects files over 100 MB).

## 6. Known risks tests must keep visible

| Risk | Tracked by |
|---|---|
| Only one forward year (2020), and it is extreme | M3 (all folds) |
| Thresholds picked on the weak 2019 validation | M6 |
| `medium` is on for 90–96% of unit-days; low precision (10% rainfall only, 21% `full` at `high`) | M1, M2; always report precision with recall |
| Labels incomplete: unreported floods count as 0 | Documented limit |
| Training rainfall is reanalysis, inference uses forecasts | Manual check once forecast archives exist |

