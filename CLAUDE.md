# Pawang AI

Flood-risk dashboard for Jakarta: a logistic-regression model gives each of the 44 kecamatan a flood probability for one
day; a FastAPI backend serves it (with advice, early warnings and alternative routes); a Next.js frontend shows it on a
Leaflet map. Keep this file short and dated; put history in `CHANGELOG.md` and team news in `docs/updates/`.

_Last reviewed: 2026-11-22. If something below disagrees with the code, the code is right: fix this file._

## Layout

| Path | What |
|---|---|
| `Pawang_Prediction_Model/` | Training, features, saved models (`models/*.json`, thresholds in `*.meta.json`). Split: train < 2019, validate 2019, **test 2020**. Production model is regularised logistic regression; XGBoost is only a benchmark. |
| `backend/app/` | FastAPI. `main.py` routes, `pipeline.py` request flow, `tools.py` (Open-Meteo, BPBD), `waterlevel.py` (BPBD scraper), `predictor.py`, `heatmap.py` (response shaping), `agents.py` + `guardrails.py` + `llm.py` + `prompts.py` (old Agents 1-3, advice, Qwen client), `floodwatch.py` (early-warning agent), `routing.py` (alternative route), `reports.py` (citizen reports), `cache.py`, `audit.py`, `config.py` |
| `backend/eval/` | `evaluate.py`, `check_agents.py`, `perf_test.py`, `watch_replay.py`. Results go to `eval/results/` (git-ignored). |
| `frontend/src/` | `app/` (landing `/`, map `/map`, proxy routes `app/api/v1/*`), `components/`, `data/` (types, demo data), `utils/`, `lib/backend.ts` |
| Docs | `AGENT_DESIGN.md` (agent, chatbot, route design + UML), `TEST_REPORT.md`, `HOW TO RUN.md`, `backend/README.md`, `CHANGELOG.md`, `docs/updates/` |

## Request flow

`request -> cache -> tools fetch rain (Open-Meteo) and water level (BPBD) -> freshness check -> retry / fallback to the
rainfall-only model / "data unavailable" -> model -> risk tier -> advice (Qwen or template, guardrailed) -> cache + audit`.

- **Risk tiers** (probability): `low` < 0.8%, `medium` 0.8-2.15%, `medium_high` 2.15-3.3%, `high` >= 3.3%. Low/high cuts come from
  `meta.json`; the medium split is `MEDIUM_HIGH_FROM` in `pipeline.py` (display tier, not retrained).
- **Two data modes** (`PAWANG_DATA_MODE`): `live` (Open-Meteo forecast + BPBD scrape) and `replay` (local archive; every
  request needs `?date=YYYY-MM-DD`, e.g. 2020-02-25). Citizen reports and Flood Watch reports count in live mode only.
- The frontend only calls its own `/api/v1/*` routes, which proxy to the backend and fall back to demo data when it is down.

## Commands

```powershell
# backend (from backend/): run ONE worker, cache, scheduler and memory are per process
python -m pytest -q                                   # must pass before every push (109 at last review)
python -m uvicorn app.main:app --port 8000            # restart after code changes unless you pass --reload
$env:PAWANG_DATA_MODE="replay"                        # or live; QWEN_ENABLED=false runs without the LLM
python -m eval.watch_replay --start 2020-01-01 --end 2020-03-31
# frontend (from frontend/)
npm run typecheck; npm run lint; npm test; npm run dev
# both together: .\scripts\run-demo.ps1 -Live   (see HOW TO RUN.md)
```

`frontend/AGENTS.md`: this Next.js version has breaking changes. Read the relevant guide in
`frontend/node_modules/next/dist/docs/` before writing Next.js code (`searchParams` is a Promise, for example).

## Rules that must not be broken

- **Numbers come from the model and tools, never from an LLM.** The LLM chooses tools, proposes actions, writes text.
  Rules validate every proposal (`guardrails.py`, `floodwatch.py`). If the LLM is off or rejected, a rule action runs.
- **Citizen reports are unverified.** They show on the map and may support an early warning, but never change a
  probability or a tier. Report text reaching an LLM is quoted data, never instructions.
- **Routes come from the routing engine** (Valhalla, `motor_scooter`), never from an LLM. Only tier `high` and reported
  flood points force a detour.
- Do not invent data. A field with no source is `null` / "Belum tersedia", not a guess.
- Requests to outside services carry no project or personal names (generic User-Agent).
- Language: UI and user-facing text in Indonesian; code, comments and commit messages in English.

## Team workflow

- Never push to `alt-branch`. Work on your own branch, run the checks above, open a pull request; someone else merges.
- Log every change, also AI-made ones, in `CHANGELOG.md` (what, which files, why).
- Never commit `.env`, `backend/logs/`, `backend/eval/results/` or `backend/data/`.
- AI assistants: do not commit or push unless asked.

## Gotchas

- A backend started without `--reload` keeps old code: a 404 on a new route usually means "restart the backend".
- The public Valhalla server is for demos and caps `exclude_polygons` at 10 km in total, so avoidance uses `exclude_locations`.
- Python `urllib` can fail TLS checks on this Windows setup; use `httpx` (what the backend uses).
- Windows Bash heredocs with quotes break easily; write scripts to a file and run them.
- `PAWANG_DEMO_DATE` supplies a day to the proxy routes when the UI sends none (replay mode).

## State (2026-11-22)

- **Built:** model + heatmap, advice with guardrails, citizen reports, landing page and map, Flood Watch Agent MVP,
  alternative route. Old Agents 1-3 still run in the pipeline and are removed only after Flood Watch is tested with Qwen.
- **Not built:** chatbot, frontend banner for `GET /api/v1/warnings`, LLM wording of route explanations, shelters, adaptive
  Flood Watch interval.
- **Not verified:** real Qwen quality (Ollama was not running in the last sessions); the route UI in a browser.
- **Open findings:** no lock on `FloodWatch.cycle()`, unauthenticated `POST /api/v1/watch/*`, audit only on triggered
  cycles, one memory file for both modes. Details and next steps: latest file in `docs/updates/`.
- Flood Watch's evaluation (2019 validation, 2020 test) is the rules-only version; the LLM's added value is unproven.
