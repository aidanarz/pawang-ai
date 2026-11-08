# Pawang AI: Backend and Agentic Layer

FastAPI backend plus the three agents from the project document (Bab 3.1). It turns a map request into a
flood heatmap by calling the trained model in `Pawang_Prediction_Model/`. Qwen orchestrates and writes
advice; it never calculates a probability.

```
request -> cache -> Agent 1 (which tools?) -> Tool Registry -> Agent 3 (fresh? complete?)
        -> Agent 2 (retry / rainfall-only fallback / data unavailable) -> FloodPredictor -> Heatmap Generator
```

| File | Component in the document |
|---|---|
| `app/main.py` | Backend FastAPI request handler (`/api/v1/heatmap`, `/api/v1/analysis`, `/api/v1/health`) |
| `app/pipeline.py` | Main flow (3.1 d), confidence label HIGH/LOW |
| `app/agents.py` | Agent 1 Data Fetch Orchestrator, Agent 3 Freshness Checker, Agent 2 Failure Handler, advice writer |
| `app/waterlevel.py` | BPBD page scraper, post -> model-station mapping, hourly history store |
| `app/tools.py` | Tool Registry: `resolve_area`, `get_weather_forecast`, `get_water_level`, `get_static_features` |
| `app/llm.py` | Self-hosted Qwen client (any OpenAI-compatible server) |
| `app/guardrails.py` | Checks on every Qwen output (allowed tools/actions, no invented numbers, no certainty claims) |
| `app/prompts.py` | Agent prompts, versioned (`PROMPT_VERSION`) |
| `app/predictor.py` | Feature building with the model's own functions, then `FloodPredictor` |
| `app/heatmap.py` | Heatmap Generator: results -> GeoJSON / analysis JSON in the frontend's shapes |
| `app/cache.py` | Cache layer, in-memory TTL (Redis later, same interface) |
| `app/audit.py` | Audit log, one JSON line per request in `logs/` |

## Run

Backend and frontend together: `.\scripts\run-demo.ps1` from the repository root (see `frontend/README.md`).
Backend only:

```bash
cd backend
pip install -r requirements.txt
copy .env.example .env            # Windows (Linux/macOS: cp)
python -m pytest                  # 58 tests, no network or GPU needed
python -m uvicorn app.main:app --reload --port 8000
```

Try it without internet or Qwen (archive data from the repo):

```bash
set PAWANG_DATA_MODE=replay       # PowerShell: $env:PAWANG_DATA_MODE="replay"
set QWEN_ENABLED=false
python -m uvicorn app.main:app --port 8000
# http://localhost:8000/api/v1/heatmap?date=2020-02-25
# http://localhost:8000/api/v1/analysis?grid_id=menteng&date=2020-02-25
# http://localhost:8000/docs   (interactive API docs)
```

## Evaluate (document 2.6: recall, precision, F1, latency)

```bash
py -m eval.evaluate system --year 2020     # replay every day of 2020 against the recorded floods (~1 min)
py -m eval.evaluate agents --repeats 3     # agent drills with Qwen (start Ollama first)
py -m eval.evaluate all
```

Writes a report, a JSON summary and row-level CSVs to `eval/results/` (git-ignored). The agent drills also
write `advice_to_rate_*.csv`: fill the `human_rating` column (1-5) with the team, which is the human feedback
loop from the document and the data for improving `app/prompts.py`.

The system report includes a train/serve skew check: the backend's probability for every kecamatan-day is
compared with the model's prediction on its own training table. Any gap means the backend builds features
differently from training.

## How the agents stay safe

Each agent first works out what is allowed from data and capabilities, asks Qwen to choose within that, and
uses Qwen's answer only if it passes `guardrails.py`. Otherwise it uses a deterministic policy. So the
platform keeps running when the GPU server is down, and a bad Qwen answer can never change a number or
skip a required step. Agent 3's verdicts are pure rules, because checking a timestamp is arithmetic.

Every decision lands in `logs/audit-YYYY-MM-DD.jsonl` with `decided_by` (`qwen` or `policy`), the raw Qwen
reply, guardrail errors, and the prompt version. That file is the input for log audits and for
evaluating or training the agents.

## API notes for the frontend

- `time` (`1h`…`24h`) maps to a calendar day in WIB, because the model predicts per day: at 20:00, `5h` is
  tomorrow. `?date=YYYY-MM-DD` overrides it.
- `risk_level` is `Low`, `Medium`, `High` or `Unknown`. `Unknown` and `Extreme` need agreeing with the
  frontend team: there is no rule for `Extreme` yet, so it is never returned.
- Fields with no data source yet (`duration_est`, `peak_time`, `inundation_range`, `siaga_level`,
  `evacuation_route`, `affected_roads`, `safe_shelters`, `confidence_score`) are `null` or empty, never made up.
- Polygons are the real kecamatan boundaries (`metadata.geometry = "admin"`), read from
  `Pawang_Prediction_Model/models/kecamatan_boundaries.geojson`. If that file is missing the backend draws
  approximate squares and says so (`"approximate"`). Rebuild the file with `python -m src.build_boundaries`
  (needs `data/external/idn_admin_boundaries.gdb.zip` from HDX `cod-ab-idn`, same source as `build_centroids`).
  A kecamatan made of separate parts is drawn with its largest part only (Tanjung Priok loses 0.5% of its area).
- `siaga_level` is filled from the live BPBD page (`Normal`, `Siaga 3`, `Siaga 2`, `Siaga 1`, worst of the kecamatan's
  stations) and is `null` in replay mode.
- Data unavailable -> HTTP 503 with `{"status": "data_unavailable", "message": ...}`.

## Live water level (BPBD)

In live mode `get_water_level` reads <https://bpbd.jakarta.go.id/waterlevel> (public page, robots.txt allows it).
One request returns all 12 posts for today (hourly, cm). The backend caches it for 5 minutes, identifies itself with a
`PawangAI` user agent, and appends every fetch to `backend/data/tma_live.csv` (git-ignored, 10 days kept).

| Setting | Default | Meaning |
|---|---|---|
| `PAWANG_TMA_LIVE` | `true` | `false` turns the scraper off (live mode then runs the rainfall-only model) |
| `PAWANG_TMA_POLL_S` | `0` | `> 0`: a background thread fetches every N seconds. Set `1800` for a real deployment so history builds up |
| `PAWANG_TMA_MIN_INTERVAL_S` | `300` | Minimum seconds between two requests to BPBD |
| `PAWANG_TMA_STORE` / `PAWANG_TMA_URL` | see `config.py` | History file / page address |

What to know:

- **Ten of the twelve posts feed the model** (`BPBD_TO_MODEL` in `app/waterlevel.py`). "Pos Depok" has no model station and
  "Pasar Ikan - Laut" is a sea gauge, not the pump station the model learned. Of 44 kecamatan, those whose nearest
  model station is one of the ten get a live level (28 at the time of testing); the others stay rainfall-only.
- **The page has no history.** The model needs yesterday's level (`tma_delta1`, `tma_max_3d`), so on a fresh install every
  area runs the rainfall-only model (confidence LOW) until the store holds the previous day. Run with
  `PAWANG_TMA_POLL_S=1800`, or leave the server up for a day, before expecting the full model. Nothing is guessed.
- **Today's `tma_max` is the maximum so far today**; the model was trained on complete days. Early in the day it can read
  lower than the model's training distribution.
- **Only for today.** Water level exists only for the current day (WIB). A target day in the future has no reading, so it
  falls back to rainfall-only (Agent 3 reports `missing`, Agent 2 chooses the fallback).
- **Values were checked against training data:** today's BPBD value of each mapped post lies inside that station's training
  range, close to its median (e.g. Manggarai 540 cm vs median 609, Pluit -180 vs -176), so unit and datum agree.
- **Layout changes are detected:** if the table disappears or has no readable values the parser raises and the pipeline
  falls back; `/api/v1/health` shows `tma_live.last_error`.
- **Terms of use:** this reads a public page at a low rate for flood early warning. Check BPBD's terms before heavy or
  commercial use, and prefer an official data feed if BPBD offers one.

## Known gaps (from the design document)

| Document says | Now | Why / next step |
|---|---|---|
| Rainfall from BMKG API | Open-Meteo forecast | The model was trained on Open-Meteo; the same provider keeps inputs consistent. BMKG can be added as a second source after its unit and grid are checked. |
| Water level from Google Flood Hub | Live: scraped from the BPBD DKI page (`app/waterlevel.py`); replay: archive | The model's water-level features come from Jakarta's gauges in cm, which Flood Hub does not provide. BPBD reports the same kind of gauges in the same unit. See "Live water level" below for the limits. |
| PostgreSQL + PostGIS static features | Model CSV files | Same data; move to PostGIS when the DB schema is ready. |
| Redis cache | In-memory | Same interface; swap when deployed on a server. |
