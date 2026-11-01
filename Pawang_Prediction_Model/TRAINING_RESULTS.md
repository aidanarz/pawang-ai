# Training Results — Pawang AI (flood prediction per kecamatan per day)

Generated 2026-10-27 from the artefacts in `models/*.meta.json`, `data/processed/cv_by_year.csv` and
`data/processed/compare_*.csv`. All numbers can be reproduced with the commands in section 9.

Terminology: *kecamatan* = sub-district; *kelurahan* = urban village; *TMA* = water level; PR-AUC = area under the
precision–recall curve; "unit-day" = one kecamatan on one day.

## 1. Production model configuration (`models/`)

| Item | Value |
|---|---|
| Prediction unit | **kecamatan** (44 units), `config.UNIT` |
| Algorithm | regularised logistic regression (`C = 0.01`, `class_weight=balanced`), stored as JSON |
| Calibration | sigmoid (Platt), fitted on the validation set |
| Rainfall source | Open-Meteo (reanalysis, 12 grid points of 0.1°), 2015-12-02 to 2020-12-31 |
| Static features | Copernicus GLO-30 elevation (`elev_mean`, `elev_min`, `elev_std`, `elev_rel_3km`); `lat`/`lon` are **not** used |
| Rainfall features | `rain_d0`, `rain_d1`, `rain_3d`, `rain_7d`, `rain_14d`, `rain_30d`, `rain_max_7d`, `wet_days_7d`, `month_sin/cos` |
| Water-level features (`full` model) | `tma_max`, `tma_pct`, `tma_delta1`, `tma_max_3d` (cm) |
| Time split | train 2016–2018, validation 2019, test 2020 |
| Versions | `rainfall_only-logistic-202610271529`, `full-logistic-202610271529` |

Two models: `rainfall_only` (rainfall + elevation) and `full` (+ water level). `mode="auto"` uses `full` for rows whose
water-level features are complete, and `rainfall_only` otherwise.

## 2. Training data

| Item | Value |
|---|---|
| Kecamatan table | 80,388 rows (44 kecamatan × 1,827 days, 2016-01-01 to 2020-12-31) |
| Positives (flooded kecamatan-days) | 2016: 410 · 2017: 292 · 2018: 170 · 2019: 258 · 2020: 472 |
| Prevalence | 2.55% · 1.82% · 1.06% · 1.61% · 2.93% |
| Water-level coverage per year | 9.1% · 19.9% · 63.9% · 84.9% · 82.7% |
| `rainfall_only` split sizes | train 48,224 · val 16,060 · test 16,104 |
| `full` split sizes (only days with water level) | train 14,933 · val 13,633 · test 13,323 |

Kelurahan table (base before aggregation): 482,328 rows, 264 kelurahan, 2,558 kelurahan-day events.

## 3. Metrics on the 2020 test (the only forward evaluation)

| Metric | `rainfall_only` | `full` |
|---|---|---|
| Test rows / events | 16,104 / 472 (2.93%) | 13,323 / 353 (2.65%) |
| **PR-AUC** | **0.132** | **0.286** |
| PR-AUC of the baseline logistic (C=1; same model family as production, so near-identical by construction) | 0.132 | 0.284 |
| PR-AUC of the 3-day rainfall ranking | 0.108 | 0.118 |
| PR-AUC of random guessing (= prevalence) | 0.029 | 0.026 |
| **ROC-AUC** | **0.792** | **0.884** |
| Brier score | 0.02784 | 0.02486 |
| `rainfall_only` on the same test rows as `full` | — | 0.134 |

Risk thresholds (chosen on the 2019 validation, then applied to the test):

| Threshold | `rainfall_only` value | `full` value |
|---|---|---|
| `medium` (validation recall ≥ 90%) | 0.00875 | 0.00806 |
| `high` (validation F1 maximum) | 0.02993 | 0.03311 |

| On the 2020 test | `rainfall_only` medium | `rainfall_only` high | `full` medium | `full` high |
|---|---|---|---|---|
| TP / FP / FN | 471 / 14,951 / 1 | 229 / 2,166 / 243 | 352 / 11,697 / 1 | 213 / 793 / 140 |
| Recall | 0.998 | 0.485 | 0.997 | 0.603 |
| Precision | 0.031 | 0.096 | 0.029 | 0.212 |
| F1 | 0.059 | 0.160 | 0.057 | 0.313 |

Sigmoid calibration: `rainfall_only` a = 0.379, b = −3.809; `full` a = 0.277, b = −3.844.

### 2019 validation metrics (read together with the test)

| | `rainfall_only` | `full` |
|---|---|---|
| Events / prevalence | 258 / 1.61% | 210 / 1.54% |
| PR-AUC | 0.031 | 0.043 |
| ROC-AUC | 0.655 | 0.617 |
| `high`: recall / precision | 0.233 / 0.048 | 0.162 / 0.104 |

The 2019 validation is much weaker than the 2020 test. See section 8.

## 4. Per-year cross-validation (production configuration)

Each fold: one year is the test, the previous year (or the following one if none exists) is the validation, the rest is training.
The folds use future data to predict the past, so they only measure stability across years.

**`rainfall_only`**

| Test year | Events | Prevalence | PR-AUC | ROC-AUC | `high`: recall / precision |
|---|---|---|---|---|---|
| 2016 | 410 | 2.5% | 0.065 | 0.674 | 0.376 / 0.058 |
| 2017 | 292 | 1.8% | 0.048 | 0.765 | 0.048 / 0.052 |
| 2018 | 170 | 1.1% | 0.058 | 0.811 | 0.365 / 0.044 |
| 2019 | 258 | 1.6% | 0.033 | 0.645 | 0.167 / 0.056 |
| 2020 | 472 | 2.9% | 0.132 | 0.792 | 0.485 / 0.096 |
| **Mean** | | | **0.067** | **0.737** | lift over random ≈ 3.4× |

**`full`** (2016 and 2017 skipped: fewer than the minimum of 5 events in a split because water-level data is sparse)

| Test year | Events | Prevalence | PR-AUC | ROC-AUC | `high`: recall / precision |
|---|---|---|---|---|---|
| 2018 | 101 | 1.0% | 0.095 | 0.788 | 0.505 / 0.040 |
| 2019 | 210 | 1.5% | 0.046 | 0.587 | 0.024 / 0.070 |
| 2020 | 353 | 2.6% | 0.286 | 0.884 | 0.603 / 0.212 |
| **Mean** | | | **0.143** | **0.753** | lift over random ≈ 7.8× |

## 5. Model coefficients (standardised features, ordered by |coefficient|)

`rainfall_only`: elev_min +0.688 · wet_days_7d +0.665 · rain_d0 +0.325 · rain_d1 +0.219 · rain_30d +0.207 ·
rain_7d +0.194 · month_cos −0.170 · elev_mean −0.154 · elev_rel_3km +0.107 · rain_max_7d −0.103 · rain_3d −0.075 ·
month_sin −0.063 · elev_std +0.036 · rain_14d −0.021

`full`: tma_pct +0.788 · month_sin +0.713 · elev_min +0.588 · elev_mean −0.486 · tma_max_3d +0.451 ·
tma_max −0.423 · month_cos +0.408 · rain_7d +0.402 · tma_delta1 +0.276 · rain_14d −0.187 · rain_d1 +0.177 ·
elev_rel_3km +0.164 · rain_d0 +0.115 · rain_max_7d −0.104 · wet_days_7d −0.074 · rain_3d +0.045 ·
rain_30d +0.031 · elev_std +0.030

Do not read individual coefficients as physical effects: the rainfall features are highly correlated (signs can flip),
and with only 44 units the static features behave like a kecamatan identity. The positive sign of `elev_min`
(higher lowest point → higher probability) contradicts physical intuition.

## 6. Experiment comparison (all on the same data)

Columns: PR-AUC / ROC-AUC on the 2020 test, and the mean PR-AUC / ROC-AUC from per-year CV. `high` = recall/precision.

### 6.1 Prediction unit and algorithm (Open-Meteo rainfall)

| Unit | Algorithm | Model | PR-AUC 2020 | ROC 2020 | `high` R/P | CV PR | CV ROC |
|---|---|---|---|---|---|---|---|
| kelurahan | logistic | rainfall only | 0.075 | 0.820 | 0.48 / 0.04 | 0.024 | 0.736 |
| kelurahan | logistic | full | 0.166 | 0.910 | 0.68 / 0.08 | 0.069 | 0.735 |
| kelurahan | XGBoost | rainfall only | 0.062 | 0.819 | 0.21 / 0.11 | 0.027 | 0.768 |
| kelurahan | XGBoost | full | 0.082 | 0.886 | 0.09 / 0.13 | 0.050 | 0.772 |
| **kecamatan** | **logistic** | rainfall only | **0.132** | 0.792 | 0.49 / 0.10 | 0.067 | 0.737 |
| **kecamatan** | **logistic** | full | **0.286** | 0.884 | 0.60 / 0.21 | 0.143 | 0.753 |
| kecamatan | XGBoost | rainfall only | 0.124 | 0.788 | 0.24 / 0.18 | 0.082 | 0.772 |
| kecamatan | XGBoost | full | 0.272 | 0.880 | 0.28 / 0.37 | 0.169 | 0.765 |
| city | logistic | rainfall only | 0.286 | 0.760 | 0.54 / 0.26 | 0.218 | 0.750 |
| city | logistic | full | 0.435 | 0.850 | 0.55 / 0.43 | 0.315 | 0.786 |
| city | XGBoost | rainfall only | 0.289 | 0.764 | 0.38 / 0.34 | 0.206 | 0.742 |
| city | XGBoost | full | 0.442 | 0.846 | 0.53 / 0.41 | 0.330 | 0.793 |

Interpretation: PR-AUC depends on prevalence (kelurahan <1%, kecamatan ~2–3%, city ~8%), so it is not comparable across units.
ROC-AUC (independent of prevalence) is nearly the same across all units; aggregation does not add discrimination ability, it only
makes the output more useful operationally (precision at similar recall rises from 8% to 21%).
Between logistic and XGBoost the gap is small compared with the year-to-year variation; logistic was chosen because it is simpler and
better on the forward split.

### 6.2 Rainfall source: Open-Meteo vs NASA IMERG (logistic)

| Unit | Model | Source | PR-AUC 2020 | ROC 2020 | CV PR | CV ROC |
|---|---|---|---|---|---|---|
| kecamatan | rainfall only | Open-Meteo | 0.132 | 0.792 | 0.067 | 0.737 |
| kecamatan | rainfall only | IMERG | 0.224 | 0.848 | 0.093 | 0.766 |
| kecamatan | full | Open-Meteo | 0.286 | 0.884 | 0.143 | 0.753 |
| kecamatan | full | IMERG | 0.332 | 0.881 | 0.141 | 0.750 |
| kelurahan | rainfall only | Open-Meteo | 0.075 | 0.820 | 0.024 | 0.736 |
| kelurahan | rainfall only | IMERG | 0.128 | 0.874 | 0.039 | 0.761 |
| kelurahan | full | Open-Meteo | 0.166 | 0.910 | 0.069 | 0.735 |
| kelurahan | full | IMERG | 0.180 | 0.910 | 0.068 | 0.747 |

IMERG helps mainly when only rainfall is available; with water level there is almost no change. **Decision: stay with
Open-Meteo** (the training flow matches the inference flow; IMERG Final is not available in real time and has no forecast).
The IMERG candidate model is kept in `models_imerg/` (`rain_source: imerg`).

### 6.3 Effect of the recall target of the `medium` threshold (production model, 2020 test)

The threshold is chosen on the 2019 validation; test recall is higher than the target because 2020 was wetter.

`full` (13,323 unit-days, 353 floods):

| Recall target | Threshold | % of unit-days ≥ medium | Test recall | Precision | Missed | False alarms |
|---|---|---|---|---|---|---|
| 0.95 | 0.0078 | 92.8% | 1.00 | 0.029 | 0 | 12,014 |
| **0.90 (current)** | 0.0081 | 90.4% | 1.00 | 0.029 | 1 | 11,697 |
| 0.80 | 0.0087 | 85.8% | 1.00 | 0.031 | 1 | 11,073 |
| 0.70 | 0.0095 | 81.2% | 0.99 | 0.032 | 3 | 10,462 |
| 0.60 | 0.0135 | 56.8% | 0.96 | 0.045 | 15 | 7,228 |
| 0.50 | 0.0203 | 28.4% | 0.84 | 0.079 | 55 | 3,491 |

`rainfall_only` (16,104 unit-days, 472 floods):

| Recall target | Threshold | % of unit-days ≥ medium | Test recall | Precision | Missed | False alarms |
|---|---|---|---|---|---|---|
| **0.90 (current)** | 0.0087 | 95.8% | 1.00 | 0.031 | 1 | 14,951 |
| 0.70 | 0.0129 | 83.8% | 0.99 | 0.035 | 3 | 13,019 |
| 0.60 | 0.0164 | 65.0% | 0.94 | 0.042 | 29 | 10,032 |
| 0.50 | 0.0196 | 49.4% | 0.88 | 0.052 | 57 | 7,541 |

Changing the target does not change PR-AUC/ROC-AUC, the scores, or the `high` threshold; it only moves the `medium` cut-off.
Not applied; `RECALL_TARGET_MEDIUM = 0.90` still holds.

### 6.4 Improvement history (2020 test, PR-AUC rainfall-only / full)

| Step | PR-AUC rainfall only | PR-AUC full |
|---|---|---|
| XGBoost, kelurahan, 2018–2020 data, isotonic calibration | 0.048 | 0.081 |
| + 2016–2017 flood data | 0.051 | 0.072 |
| + no `lat/lon`, conservative parameters | 0.053 | 0.063 |
| logistic, isotonic calibration (calibration artefact) | 0.044 | 0.064 |
| logistic, sigmoid calibration, kelurahan | 0.075 | 0.166 |
| **logistic, sigmoid, kecamatan (production)** | **0.132** | **0.286** |

Rows with different units are not directly comparable (see the note in 6.1).

## 7. Failed or unused experiments

- **Isotonic calibration**: collapsed 68 thousand scores into 16–35 unique values so PR-AUC dropped 2–3×. It also made the
  initial XGBoost results read lower than they really were. Replaced by sigmoid.
- **CHIRPS (0.05°)**: the download stopped because the server answered HTTP 403 after parallel requests; only 6.6% of days
  were read, so it was not evaluated. The code now rejects gappy caches (> 2% missing).
- **IMERG**: succeeded, results in 6.2; not chosen for production.

## 8. Quality notes and limits of the results

1. **Only one forward test year (2020), and 2020 is an extreme year** (large floods on 1 Jan and 25 Feb). The 2019 validation
   and the 2019 CV fold are much weaker (ROC 0.59–0.65). The 2020 test numbers are probably too optimistic for an ordinary year.
2. **The thresholds are chosen on the weak 2019 validation** (ROC 0.62–0.66) and then applied to 2020; they may shift if
   the validation year is changed.
3. **The `medium` threshold is almost always on** (90–96% of unit-days). On an extreme rain day such as 25 Feb 2020, all
   44 kecamatan are labelled `high`; the model does not separate flooded from non-flooded kecamatan on that day.
4. **Low precision**: at the `high` threshold, 10% (rainfall only) and 21% (`full`) of predictions are correct.
5. **Labels are incomplete**: days without a record are treated as 0, yet may be unreported floods. Probabilities tend to be low.
6. **The `full` model is trained only on 2018–2019** (2016–2017 water level is very sparse); `full` CV has only 3 folds, 2016–2017 are skipped.
7. **Training rainfall (reanalysis) ≠ inference rainfall (forecast)**; the difference has not been measured.
8. **Static features act as a kecamatan identity** (44 units), and the sign of `elev_min` contradicts physical intuition.
9. **Water-level datum shifts** when a station is renamed (e.g. Katulampa 350 → 190 mm) affect `tma_pct`.
10. An Open-Meteo rainfall day = a local WIB day; IMERG/CHIRPS = UTC (not used in production).

## 9. How to reproduce

```bash
python -m src.build_dataset        # kelurahan table + aggregation to kecamatan (config.UNIT)
python -m src.train                # models/ (logistic, sigmoid, kecamatan, Open-Meteo)
python -m src.cv                   # per-year cross-validation -> data/processed/cv_by_year.csv
# IMERG candidate (needs EARTHDATA_TOKEN in .env):
PAWANG_RAIN_SOURCE=imerg PAWANG_MODELS_DIR=models_imerg python -m src.train
python -m pytest                   # 37 tests
```
