# Changelog

Every change (also the ones made with an AI assistant): what, which files, why. Newest first.

## 2026-11-22 · Alternative route (branch `feature/alt-route`, built on `feature/flood-watch`)
- **Engine check:** public Valhalla (`valhalla1.openstreetmap.de`) works from Jakarta with profile `motor_scooter`
  (motorcycle), returns up to 2 alternatives, and `exclude_locations` (max 50 points) really moves a route out of a
  kecamatan. `exclude_polygons` is capped at 10 km in TOTAL there, too small for a kecamatan, so avoidance is done with
  points on the risky stretches (ask again, at most 2 extra calls). OpenRouteService was not needed (no motorcycle
  profile, needs a key). The public server is for demos: self-host Valhalla for real traffic (same code, set `PAWANG_ROUTE_URL`).
- **New** `backend/app/routing.py`: Valhalla client, `RiskMap` (high / medium_high kecamatan polygons + citizen "banjir"
  points, shapely), scoring and `plan_route`. Rules decide what to avoid and pick the route; the engine computes roads;
  the text is built from numbers and street names that are in the route result. Verdicts: `clear`, `safe`, `reduced`,
  `unavoidable`. Only model-tier High and reported flood points force a detour; medium_high only breaks ties; an
  alternative must cut exposure by at least 0.5 or 20% to replace the fastest route.
- **New route** `POST /api/v1/route` in `backend/app/main.py` (cached like the heatmap, 20 requests/minute for everyone,
  503 when the engine is down, 422 when there is no road). Citizen reports count in live mode only, never the demo ones.
- `backend/app/config.py`, `.env.example`: `PAWANG_ROUTE_URL`, `PAWANG_ROUTE_COSTING`, `PAWANG_ROUTE_TIMEOUT_S`,
  `PAWANG_ROUTE_PER_MINUTE`. `requirements-serve.txt`: `shapely`. The engine request carries a generic User-Agent.
- **New** `backend/tests/test_routing.py`: 15 tests (mock engine). Backend total 109.
- Frontend: **new** `components/RoutePlanner.tsx` (replaces the "Jalur alternatif / evakuasi" text in the Saran tab:
  from = selected area, to = kecamatan dropdown or a click on the map), route layer and destination picking in
  `LeafletMap.tsx`, state in `MapDashboard.tsx`, proxy `app/api/v1/route/route.ts`, `utils/routeStyle.ts` + test, types.
- Not done: LLM wording of the explanation (the text is rule-built), shelters as destinations, address search.
- Real check (replay 2020-01-20, 40 random kecamatan pairs): 39 already clear, 1 rerouted (Tebet to Pesanggrahan,
  1.0 km of High area avoided for +3.4 km, +12 min).

## 2026-11-21 · Flood Watch Agent MVP (Coki, branch `feature/flood-watch`)
- **New** `backend/app/floodwatch.py`: proactive early-warning agent (rule trigger, memory, Qwen tool loop, guardrail,
  default rule action, active warnings, background scheduler). Design: "Agent plan and changes" section 2.1.
- **New routes** in `backend/app/main.py`: `GET /api/v1/warnings`, `POST /api/v1/watch/run`, `POST /api/v1/watch/replay`.
- `backend/app/prompts.py`: Flood Watch system prompt (`FLOOD_WATCH_PROMPT_VERSION 2026-11-21.1`).
- `backend/app/config.py`, `backend/.env.example`: `PAWANG_WATCH_INTERVAL_S`, `PAWANG_WATCH_MEMORY`, `PAWANG_WATCH_COOLDOWN_H`.
- **New** `backend/eval/watch_replay.py`: replay vs recorded floods (naive threshold vs Flood Watch rules vs Qwen).
- **New** `backend/tests/test_floodwatch.py`: 20 tests. Backend total 94 passed.
- Old Agents 1-3 are untouched; they are removed only after Flood Watch has been tested with Qwen (plan section 3).

## 2026-11-19/21 · Fixes (Coki, PR #3 `fix/minor-2026-11-19`)
- Qwen prompt knows "cukup tinggi" (`medium_high`); impossible date returns 422 (I-4); sidebar shows the area name
  while the analysis loads; `waterlevel.hourly()` read `siaga` after dropping the column (live mode fell back to
  rainfall_only).
