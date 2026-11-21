# Changelog

Every change (also the ones made with an AI assistant): what, which files, why. Newest first.

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
