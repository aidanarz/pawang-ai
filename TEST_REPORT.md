# Pawang AI: Test Report

All testing done on the project so far, in one place: the flood model (run of `TEST_PLAN.md` on the real data), the backend
(FastAPI, agents, BPBD scraper), the frontend, and manual end-to-end checks. Run date: 2026-11-09 (the manual checks were
done 2026-11-08 and 2026-11-09 while building; dates are given next to each).

## 1. Test Summary

| Suite | What it covers | Result |
|---|---|---|
| Model: `TEST_PLAN.md` on real data | data validation, model quality, inference contract, robustness, release gate (23 checks) | **19 PASS, 3 FAIL, 1 INFO** (section 2) |
| Model: unit and integration tests | features, aggregation, training, prediction contract (37 tests) | 37 / 37 pass |
| Backend: pytest | API, agents, guardrails, Qwen client, BPBD scraper, boundaries (58 tests) | 58 / 58 pass |
| Backend: system evaluation 2020 | whole backend replayed over 366 days against recorded floods | see section 3.2; train/serve skew **0.0** |
| Frontend: vitest | proxy routes, null handling, colours, formatting (18 tests) | 18 / 18 pass |
| Frontend: static checks | `tsc --noEmit`, `eslint`, `next build` | all clean |
| Manual end to end | backend + frontend + real internet + browser screenshots | passed, with 2 limits (section 5) |

**Three checks fail, all in the data and model pipeline, none in the backend or frontend:**

| ID | Pri | Finding | Suggested fix |
|---|---|---|---|
| D3 | **P1** | The Open-Meteo rainfall cache (the production source) is trusted even when 5% of its days are missing. CHIRPS and IMERG reject such a cache. | Apply the existing `MAX_MISSING_FRAC` (2%) check to the Open-Meteo branch of `fetch_rainfall.run` |
| D4 | P2 | In the 2017 source file, 67 of 264 flood records (25%) have a blank date cell, so only 85.6% of the day-rows (after expanding multi-day records) have a valid day. Other years: 99.7-100%. | Data limit in the source file: ask the data owner for a complete 2017 file, or document it. Those records cannot be used as daily labels |
| F2 | P2 | `build_tma` merges a renamed station whose level steps by +500 cm without any warning. | Warn when the station's median level changes by more than a set amount at the rename date |

No model or backend source code was changed to make a check pass; the failing checks are reported as found. (Two bugs in the test runner itself, a cache date range in D3 and a text-based heuristic in F2, were fixed while building it.)

## 2. Model: TEST_PLAN.md on the real data

Run with `python tests/run_test_plan.py` from `Pawang_Prediction_Model/` (about 1 minute). Full tables, per-fold numbers and
the reliability table are in [Pawang_Prediction_Model/TEST_RESULTS.md](Pawang_Prediction_Model/TEST_RESULTS.md).
All writing happens in a temporary copy of `data/`; the tracked data and models are only read.

| ID | Test | Criterion | Measured | Result |
|---|---|---|---|---|
| D1 | Positives per year after rebuild | 410 / 292 / 170 / 258 / 472 | 410 / 292 / 170 / 258 / 472 | PASS |
| D2 | No duplicate rows; 1,827 contiguous days | 0 duplicates, 0 gaps | 0 duplicates, 0 gaps, 1,827 days | PASS |
| D2b | Rebuild reproduces the committed table | identical | max difference 0.0 | PASS |
| D3 | Gappy rainfall cache rejected | rejected above 2% missing | Open-Meteo: **trusted**; CHIRPS: rejected | **FAIL** |
| D4 | Flood date parse rate | at least 95% per year | min 85.6% (2017) | **FAIL** |
| M1 | Beats random | PR-AUC at least 2x prevalence, every fold | min 2.05x, mean 5.09x (8 folds) | PASS |
| M2 | Beats rainfall baseline | above 3-day rainfall ranking | 2020: 0.132 vs 0.108; wins 6 of 8 folds | PASS |
| M3 | Stable across years | mean ROC-AUC at least 0.70, no fold below 0.55 | rainfall_only 0.737 (min 0.645); full 0.753 (min 0.587) | PASS |
| M4 | Leakage check | shuffled labels fall to about prevalence | 1.08x prevalence (real labels 4.50x) | PASS |
| M5 | Calibration | Brier not worse than prevalence-only | 0.0278 vs 0.0286 (rainfall_only); 0.0249 vs 0.0259 (full) | PASS |
| M6 | Threshold stability | report the shift | `high` 0.033-0.102 (full) over validation years | INFO |
| M7 | Logistic vs XGBoost | logistic not worse by more than 0.03 | XGBoost better by +0.015 / +0.026 | PASS |
| I1 | Output bounds | p in [0,1], valid risk labels | 16,104 rows, p 0.0023-0.2920 | PASS |
| I2 | Threshold boundary | equal to threshold maps up | correct in both models | PASS |
| I3 | Determinism | same output, any row order | identical | PASS |
| I4 | `strict=False` | unknown for broken rows only | correct; `strict=True` raises | PASS |
| I5 | Model files vs meta | follows `algo`; no models raises | correct | PASS |
| F1 | Rainfall above training max | bounded, non-decreasing | holds up to 81,235 mm (training max 568) | PASS |
| F2 | TMA datum shift | `tma_pct` bounded; warning on jump | bounded; **no warning** | **FAIL** |
| F3 | IMERG HTTP 401/403/429 | stops cleanly, cache kept | stops at once, cache untouched | PASS |
| G1 | Release gate: pytest | all pass | 37 passed | PASS |
| G3 | Release gate: rebuild vs committed CV | drop at most 0.02 | change +0.0000 | PASS |
| G3b | Release gate: retrain | reproduces models | same metrics and thresholds | PASS |

### What the passing results do and do not tell you

- **The pipeline is reproducible.** Rebuilding from raw files gives a bit-identical training table and retraining gives the
  same metrics and thresholds (D2b, G3, G3b). There is no hidden state.
- **The model has real skill, but modest.** It beats chance on every fold (M1) and shuffling the labels removes the skill (M4),
  so there is no leakage. It does not clearly beat the simple 3-day-rainfall ranking everywhere: it loses in 2018 for both
  models (M2). 2019 is the weakest year (2.05x over random, just above the bar).
- **Probabilities are compressed (from the M5 reliability table, test year 2020).** The calibration check passes on Brier score,
  but the highest decile of the `full` model is predicted at 4.0% while 17.9% of those days really flooded, and the lowest
  deciles are predicted at 0.7-0.9% against 0.1% observed. The model ranks well but its percentages are too close together.
  This is why the UI shows 1-7% even on a day when 40 of 44 kecamatan flooded, and it supports showing the number next to a
  comparison with a normal day rather than as a stand-alone percentage.
- **Thresholds depend on which year is used for validation (M6).** For the `full` model the `high` threshold ranges from 3.3% to
  10.2% depending on the validation year. The thresholds in `meta.json` come from the weak 2019 validation year, as the test
  plan already warned.
- **XGBoost is slightly better than logistic regression** in the cross-validation (+0.015 and +0.026 PR-AUC), within the 0.03
  tolerance. Keeping logistic regression is a valid choice for simplicity, but the gap is worth knowing.
- **`full` has only 3 usable CV folds** (2016 and 2017 have too few positives with water-level data), so its stability claim (M3)
  rests on little evidence.

## 3. Backend

### 3.1 Automated tests: 58 tests (`cd backend; python -m pytest`)

| Area | Tests | What is checked |
|---|---|---|
| API and pipeline (replay) | 7 | flood day 2020-02-25 matches the model's own report; full model and HIGH confidence when water level is present; no invented fields; `data_unavailable` when rainfall is missing; unknown area gives 404; cache hit; audit log written |
| Live mode with mocked Open-Meteo | 3 | rainfall-only model with LOW confidence; Agent 2 retries a failed forecast; Agent 2 reports unavailable after the retry |
| Agents and Qwen guardrails | 21 | Agent 1 accepts a valid plan and rejects unavailable or incomplete ones; Agent 2 cannot skip the rainfall step; Agent 3 flags stale or incomplete data; advice is rejected when it invents a number, claims certainty, names the wrong risk, uses wrong day wording or a false source; templates pass the guardrails |
| Qwen client | 4 | Ollama thinking off and fenced JSON parsed; empty reply is an error, not a crash; a slow answer does not disable Qwen; Ollama down trips the breaker |
| Catalogue and horizon | 3 | 44 kecamatan with every kelurahan mapped; hour horizon maps to the right calendar day; day label and rain category |
| `/health` | 2 | replay date range reported; none in live mode |
| System evaluation | 1 | backend vs model gap is zero (no train/serve skew) |
| BPBD parser (real page snapshot) | 6 | 12 posts, hours 00-21; 10 posts mapped to model stations (ids checked against the model's own reference); siaga class read; hours later than now dropped; layout change raises |
| BPBD store and fetcher | 4 | history deduplicated and persisted; at most one request per interval and a `PawangAI` user agent; failed fetch keeps stored history; daily maximum, 3-day window, latest siaga |
| Live pipeline with BPBD | 5 | full model runs where a BPBD station exists (partial coverage); no history gives rainfall-only instead of a guess; BPBD down still serves; scraper can be switched off; `/health` shows collector state |
| Boundaries | 2 | all 44 polygons valid, contain their centroid, total about 640 km2; falls back to squares if the file is missing |

The BPBD tests use a saved snapshot of the real page (`backend/tests/fixtures/bpbd_waterlevel.html`), so they need no network.

### 3.2 System evaluation (`python -m eval.evaluate system --year 2020`)

The whole backend (cache, agents, tools, model) replayed on every day of 2020 against the recorded floods:

| Metric | Value |
|---|---|
| Kecamatan-days / floods recorded | 16,104 / 472 |
| PR-AUC (random = 0.0293) | 0.2245 |
| `high`: recall / precision / F1 | 0.5424 / 0.1694 / 0.2582 |
| `medium` or higher: recall / precision / F1 | 0.9979 / 0.0318 / 0.0616 |
| Coverage (not `unknown`), days with data unavailable | 100%, 0 |
| Share with LOW confidence | 20.2% |
| **Backend vs model, maximum probability gap** | **0.0** |
| Latency p50 / p95 (no Qwen) | 358 ms / 510 ms |

The zero gap means the backend builds features exactly as training did. The `medium` label catches almost every flood but is
attached to about 92% of all days, so it separates little; `high` is selective (17% of its days flood, about 6 times the base rate).

### 3.3 Not run

- `python -m eval.evaluate agents`: needs Qwen. Ollama is running but only has `qwen2.5:7b`, while the backend asks for
  `qwen3.5:4b` (HTTP 404). The backend falls back to its deterministic policy (`advice_by: policy`), which is what every
  manual test above used. The Qwen path is covered only by mocked tests (the agent and guardrail tests).

## 4. Frontend

| Check | Result |
|---|---|
| vitest: 18 tests | pass. `backend.test.ts` (8): null fields get display text, hydrograph points without a level dropped, stations without coordinates dropped, demo date added only when none given, "backend down" kept apart from "backend has no data"; `areaColors.test.ts` (6): colours scale between lowest and highest probability, an area's colour does not depend on its neighbours, areas without a probability are left out; `formatProbability.test.ts` (4): `0.0572` shows `5,7%`, clamping, no number shows a dash |
| `tsc --noEmit` | clean |
| `eslint` | clean |
| `next build` (production, separate copy) | compiled, all routes built |

## 5. Manual end-to-end checks

| Date | Check | Result |
|---|---|---|
| 11-08 | Next.js routes forward to the backend; response header `x-pawang-source: backend` | pass |
| 11-08 | Probabilities returned by the Next.js route equal the backend's, all 44 kecamatan | identical |
| 11-08 | Date with no data (2031-01-01) | API: HTTP 503 `data_unavailable` passed through by the Next.js route instead of demo data. The red banner that shows it was not screenshotted |
| 11-08 | Backend not reachable | route fell back to demo data and set `x-pawang-source: mock` (seen once, by accident, through an IPv6 address problem that was then fixed). The amber "Backend tidak terhubung" banner was not screenshotted |
| 11-08 | Real internet, live mode (22:04 WIB): Open-Meteo plus the real BPBD page | 12 posts and 264 readings parsed; 28 of 44 kecamatan got a live water level and a siaga label; all 44 correctly stayed rainfall-only (no history yet); `geometry: "admin"` |
| 11-08 | BPBD values against training data | all 10 mapped posts inside their training range and near the median (Manggarai 540 vs 609, Pluit -180 vs -176): same unit and datum |
| 11-08 | Real boundaries | 44 valid polygons, total area 0.0525 deg2 (about 640 km2) |
| 11-08 | Qwen | server reachable but model missing (404): fell back to policy, no crash |
| 11-09 | UI in headless Chrome: [docs/test-evidence/ui-replay-2020-02-25.png](docs/test-evidence/ui-replay-2020-02-25.png) | archive banner and date picker, legend 3.5-7.3%, one colour per kecamatan, sidebar for Kebayoran Lama showing 7,3% and a water-level chart |

## 6. Known limits of this testing

- **Live mode with the full model was never run end to end on real data.** The BPBD page has no history, so a fresh store has
  no previous day. The full-model path is tested with fixtures only (test "full model runs where a BPBD station exists"). The
  real check needs the collector to run for about 2 days (`PAWANG_TMA_POLL_S=1800`).
- Today's water level is the maximum so far today, while the model trained on whole days. This bias is not measured.
- Qwen quality is untested (see 3.3). The advice text in the UI is currently template text.
- Training rainfall is reanalysis and inference uses forecasts. No forecast archive exists, so this mismatch is not tested.
- Flood labels are incomplete (unreported floods count as 0), so precision figures are probably understated.
- No mobile, accessibility, load, or security testing was done. The frontend was checked only in desktop headless Chrome.
- The BPBD scraper depends on one page layout. The parser fails loudly if the table changes, and the test uses a snapshot from 2026-11-08.

## 7. Recommended next steps

1. Fix D3 (apply the 2% gap check to Open-Meteo); it is a P1 and a one-line condition.
2. Let the live collector run for 2 days, then repeat the live check and confirm `model_mode: full` appears.
3. Decide the user-facing risk labels and thresholds with the team (M5 and M6 show the percentages are compressed and the
   thresholds are unstable); then re-run `tests/run_test_plan.py` as the release gate.
4. Install the Qwen model the backend expects (or set `QWEN_MODEL=qwen2.5:7b`) and run `eval.evaluate agents`.

## 8. How to reproduce

```bash
# model: full test plan on real data (about 1 min), writes Pawang_Prediction_Model/TEST_RESULTS.md
cd Pawang_Prediction_Model && python tests/run_test_plan.py
cd Pawang_Prediction_Model && python -m pytest                 # 37 unit and integration tests

# backend
cd backend && python -m pytest                                 # 58 tests, no network needed
cd backend && python -m eval.evaluate system --year 2020       # system evaluation (about 1 min)

# frontend
cd frontend && npm run typecheck && npm run lint && npm test
```

`.github/workflows/ci.yml` runs the backend tests and the frontend checks on every push and pull request.
