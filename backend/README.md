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
| `app/tools.py` | Tool Registry: `resolve_area`, `get_weather_forecast`, `get_water_level`, `get_static_features` |
| `app/llm.py` | Self-hosted Qwen client (any OpenAI-compatible server) |
| `app/guardrails.py` | Checks on every Qwen output (allowed tools/actions, no invented numbers, no certainty claims) |
| `app/prompts.py` | Agent prompts, versioned (`PROMPT_VERSION`) |
| `app/predictor.py` | Feature building with the model's own functions, then `FloodPredictor` |
| `app/heatmap.py` | Heatmap Generator: results -> GeoJSON / analysis JSON in the frontend's shapes |
| `app/cache.py` | Cache layer, in-memory TTL (Redis later, same interface) |
| `app/audit.py` | Audit log, one JSON line per request in `logs/` |

## Run

```bash
cd backend
pip install -r requirements.txt
copy .env.example .env            # Windows (Linux/macOS: cp)
python -m pytest                  # 25 tests, no network or GPU needed
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
- Polygons are approximate squares around each kecamatan centroid until boundary polygons are added.
- Data unavailable -> HTTP 503 with `{"status": "data_unavailable", "message": ...}`.

## Known gaps (from the design document)

| Document says | Now | Why / next step |
|---|---|---|
| Rainfall from BMKG API | Open-Meteo forecast | The model was trained on Open-Meteo; the same provider keeps inputs consistent. BMKG can be added as a second source after its unit and grid are checked. |
| Water level from Google Flood Hub | Archive replay only; live returns "not configured" | The model's water-level features come from Jakarta's DSDA stations in cm, which Flood Hub does not provide. A live BPBD collector is the next task. |
| PostgreSQL + PostGIS static features | Model CSV files | Same data; move to PostGIS when the DB schema is ready. |
| Redis cache | In-memory | Same interface; swap when deployed on a server. |
