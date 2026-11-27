# Changelog

Every change (also the ones made with an AI assistant): what, which files, why. Newest first.

## 2026-11-28 · Frontend: legend, dark search bar, sidebar tabs
- `components/HeatmapLegend.tsx`: the risk legend (bottom left) can be minimised to a small "Legenda" pill and opened again.
- `components/RightSidebar.tsx`: the search bar turned white when focused in dark mode (`focus:bg-white` had no dark
  counterpart); it now stays dark. The Ringkasan / Hujan / Saran tabs moved to the top of the panel (under the search
  and horizon bar); the area header and the tab content scroll together beneath them.

## 2026-11-27 · Pemilihan mode Live/Histori
- **Map mode switch:** `MapDashboard.tsx`, `DataSourceBanner.tsx`, `TopStatusPill.tsx`, `data/types.ts`,
  `utils/predictionMode.ts` and tests. The default is Live; Histori exposes a date picker bounded by the archive
  range. Prediction source and connection/time/risk status now share one pill.
- **Request-level prediction modes:** `backend/app/main.py`, `backend/app/routing.py` and tests. Heatmap, analysis and
  route requests select live or replay without restarting the server; health reports available modes and archive days.
- **Usage docs:** `HOW TO RUN.md` documents both API modes and frontend checks.

## 2026-11-27 · Early warnings in the frontend + admin agent log page
- **Public:** `GET /api/v1/warnings` is now shown. New `components/WarningBanner.tsx` (top left, under "Lapor kondisi"):
  one pill "N peringatan dini aktif" coloured by the highest level (waspada yellow, siaga orange, awas red); it opens
  the list, and a click selects the kecamatan and flies the map to it. The sidebar's Ringkasan tab shows the active
  warning of the selected area. `MapDashboard.tsx` polls every 60 s; proxy `app/api/v1/warnings/route.ts` (empty list
  when the backend is down). Types in `data/agent.ts`, colours and labels in `utils/warningStyle.ts` (+ test).
- **Admin page `/admin/agent`** (`components/AgentLog.tsx`, `noindex`): every Flood Watch cycle (kept: the last 200),
  newest first, also the ones where nothing changed: changes the rules detected, each tool call with its result, the
  LLM proposal, guardrail errors, published / suppressed / cleared warnings; totals; active warnings; settings; a
  "run one cycle now" form. Auto-refresh every 15 s.
- **Admin token:** backend `PAWANG_ADMIN_TOKEN`. New `GET /api/v1/admin/agent-log` exists only when it is set (404
  otherwise) and needs the header `X-Admin-Token` (constant-time compare; 10 wrong tokens/min for everyone, then 429).
  Once the token is set, `POST /api/v1/watch/run` and `/watch/replay` need it too, which closes the open finding "unauthenticated
  watch endpoints". With no token they stay open and rate-limited as before. The page keeps the token in
  `sessionStorage` (this tab only) and sends it through `app/api/v1/admin/agent/route.ts`; the backend does the checking.
- `backend/app/main.py`, `config.py`, `floodwatch.py` (`WatchScheduler.running`), `.env.example`; 4 new backend tests
  (backend total 135) and 5 new frontend tests (total 31).
- Note: in replay mode nothing publishes warnings until a cycle is run (the admin page's button, or
  `POST /api/v1/watch/run?date=2020-02-25`); the live scheduler needs `PAWANG_WATCH_INTERVAL_S` > 0.

## 2026-11-22 · Pre-deploy fixes (Coki, branch `fix/pre-deploy-2026-11-22` = `feature/alt-route` + `alt-branch`)
- **Frontend error from "Fixing hydrochart #2" fixed:** stations without coordinates were passed to the map
  (`tsc` error, Leaflet cannot draw a marker without lat/lng). The map now skips them; the list and hydrograph keep
  them. `LeafletMap.tsx`, test updated in `lib/backend.test.ts`; unused `setLayers` removed in `MapDashboard.tsx`.
- **Flood Watch review findings (Aidan, 22 Nov) 1-4 fixed** in `floodwatch.py`, `main.py`, `config.py`:
  one cycle at a time (lock; `POST /watch/run` answers 409 while another cycle runs), rate limits on
  `/watch/run` (6/min) and `/watch/replay` (2/min), every cycle audited (also "nothing changed"), memory file per
  data mode (`floodwatch_memory_live.json` / `_replay.json`), so replay demo warnings never reach the live feed.
  +4 tests (`tests/test_floodwatch.py`).
- **Next.js 16.4.3 -> 16.4.6** (security advisory Nov 2026): `frontend/package.json`, `package-lock.json`.

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
- **New** `backend/tests/test_routing.py`: 29 tests (mock engine, scripted LLM). Backend total 123.
- **LLM explanation** (`explain_route` in `routing.py`, prompt `ROUTE_PROMPT_VERSION 2026-11-22.4` in `prompts.py`):
  Qwen may re-word the explanation; its text is shown only if it passes `check_route_text`, else the rule text is used.
  The response says who worded it (`explanation_by`: `qwen` or `rules`) and the choice is written to the audit log.
  Checks: no digits (the cards show the numbers), no weather talk, no reassurance ("tanpa khawatir"), no certainty
  claim, no source claim, every "Jalan ..." must be a street of the route, and a `reduced`/`unavoidable` verdict may
  not be described as avoided (negation-aware). The LLM is given no numbers, only words ("sedikit", "berkurang, tetapi
  masih ada"). Settings: `PAWANG_ROUTE_LLM_TIMEOUT_S` (20); the LLM runs only when it is enabled (`QWEN_ENABLED`).
- **New** `backend/eval/route_explain_check.py`: runs the real Qwen on one plan per verdict and counts guardrail passes.
  Measured with `qwen2.5:7b` (the only model installed here; the default `qwen3.5:4b` was not): 20/20 passed after
  three rounds of fixes. First rounds found real problems: Qwen copied numbers and used them for the wrong thing
  ("2 km still exposed", really the detour length), invented weather, and over-reassured; and my own check rejected an
  honest negated sentence. A call takes 11-14 s on this machine (CPU), so a route request waits that long once (cached
  after). The guardrail cannot verify meaning, e.g. one `reduced` text said "titik banjir laporan warga" although none counted.
- Frontend: **new** `components/RoutePlanner.tsx` (replaces the "Jalur alternatif / evakuasi" text in the Saran tab:
  from = selected area, to = kecamatan dropdown or a click on the map), route layer and destination picking in
  `LeafletMap.tsx`, state in `MapDashboard.tsx`, proxy `app/api/v1/route/route.ts`, `utils/routeStyle.ts` + test, types.
- Not done: shelters as destinations, address search.
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
