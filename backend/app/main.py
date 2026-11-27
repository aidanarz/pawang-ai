"""FastAPI backend for Pawang AI.

    python -m uvicorn app.main:app --reload --port 8000      (run from the backend/ folder)

Routes keep the paths the frontend already calls (/api/v1/heatmap, /api/v1/analysis), so the frontend team
only has to point its fetch at this server instead of the mock route handlers.
"""
from __future__ import annotations

import datetime as dt
import logging
import re
from contextlib import asynccontextmanager
from dataclasses import replace
from typing import Literal

import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from . import heatmap as H
from .agents import AdviceFacts, AdviceWriter
from .areas import get_catalog
from .audit import AuditLog
from .cache import TTLCache
from .config import Settings, get_settings
from .floodwatch import FloodWatch, WatchBusy, WatchMemory, WatchScheduler
from .llm import LLM, NoLLM, QwenClient
from .pipeline import Pipeline
from .predictor import get_predictor
from .reports import RateLimited, ReportIn, ReportStore, demo_reports
from .prompts import ROUTE_PROMPT_VERSION
from .routing import (MAX_KM, MIN_METERS, NoRoute, PerMinute, RiskMap, Projector, RouteRequest, RoutingError,
                      ValhallaClient, distance_m, explain_route, plan_route)
from .tools import ToolRegistry

WIB = dt.timezone(dt.timedelta(hours=7))
log = logging.getLogger("pawang.main")
HORIZONS = {"1h": 1, "3h": 3, "5h": 5, "12h": 12, "24h": 24}


def target_date_for(horizon: str, now: dt.datetime | None = None) -> dt.date:
    """The model predicts per DAY. A horizon of N hours maps to the calendar day (WIB) that N hours from
    now falls on: at 20:00, '5h' is tomorrow; at 09:00 it is today."""
    if horizon not in HORIZONS:
        raise HTTPException(422, f"time must be one of {list(HORIZONS)}")
    now = now or dt.datetime.now(WIB)
    return (now.astimezone(WIB) + dt.timedelta(hours=HORIZONS[horizon])).date()


def replay_date_range(s: Settings) -> dict | None:
    """Target days with a complete rainfall-history window across all archived points."""
    folder = s.interim_dir / "rain"
    files = sorted(folder.glob("*.csv")) if folder.exists() else []
    if not files:
        return None
    starts, ends = [], []
    for path in files:
        dates = pd.read_csv(path, usecols=["date"], parse_dates=["date"])["date"].dropna()
        if dates.empty:
            return None
        starts.append(dates.min().date())
        ends.append(dates.max().date())
    lo = max(starts) + dt.timedelta(days=s.rain_history_days - 1)
    hi = min(ends)
    return {"min": lo.isoformat(), "max": hi.isoformat()} if lo <= hi else None


def create_app(settings: Settings | None = None, llm: LLM | None = None,
               http: httpx.Client | None = None, audit_enabled: bool = True) -> FastAPI:
    s = settings or get_settings()
    catalog = get_catalog(str(s.models_dir))
    llm = llm or (QwenClient(s) if s.llm_enabled else NoLLM())
    provider_http = http if http is not None else httpx.Client(timeout=20.0)
    tools = ToolRegistry(s, catalog, http=provider_http)
    pipeline = Pipeline(s, tools, llm, TTLCache(s.cache_ttl_s), AuditLog(s.audit_dir, audit_enabled))
    pipelines = {s.data_mode: pipeline}
    for mode in ("live", "replay"):
        if mode not in pipelines:
            mode_settings = replace(s, data_mode=mode)
            mode_tools = ToolRegistry(mode_settings, catalog, http=provider_http)
            pipelines[mode] = Pipeline(
                mode_settings, mode_tools, llm, TTLCache(s.cache_ttl_s),
                AuditLog(s.audit_dir, audit_enabled),
            )
    advice_writer = AdviceWriter(llm)
    reports = ReportStore(s.reports_store, s.reports_ttl_h, demo_reports(catalog) if s.reports_demo else None)
    router = ValhallaClient(s.route_url, s.route_costing, http=http, timeout_s=s.route_timeout_s)
    route_cache, route_limit = TTLCache(s.cache_ttl_s), PerMinute(s.route_per_minute)
    # Flood Watch Agent: reads citizen reports only in live mode (replay days are years old; today's reports
    # say nothing about them).
    # One memory file per data mode, so warnings from a replay demo never show up in the live feed.
    watch_mem_path = s.watch_memory_path.with_name(
        f"{s.watch_memory_path.stem}_{s.data_mode}{s.watch_memory_path.suffix}")
    watch_run_limit, watch_replay_limit = PerMinute(s.watch_run_per_minute), PerMinute(s.watch_replay_per_minute)
    watch = FloodWatch(pipeline, llm, WatchMemory(watch_mem_path),
                       reports=(lambda: [r for r in reports.active() if not r.get("demo")]) if s.data_mode == "live"
                       else None, cooldown_h=s.watch_cooldown_h)
    scheduler = WatchScheduler(watch, s.watch_interval_s if s.data_mode == "live" else 0)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if s.data_mode == "live" and s.tma_live_enabled and s.tma_poll_s > 0:
            tools.tma_live.start_polling(s.tma_poll_s)
        scheduler.start()
        try:
            yield
        finally:
            scheduler.stop()
            if s.data_mode == "live" and s.tma_live_enabled and s.tma_poll_s > 0:
                tools.tma_live.stop_polling()
            if http is None:
                provider_http.close()

    app = FastAPI(title="Pawang AI backend", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                       allow_methods=["GET", "POST"], allow_headers=["*"])
    app.state.pipeline = pipeline
    app.state.pipelines = pipelines
    app.state.watch = watch

    # Optional background poller: builds the water-level history (the model needs yesterday's level) even when nobody
    # calls the API. Off by default (PAWANG_TMA_POLL_S=0); the demo script turns it on for live mode.
    def resolve_date(time: str, date: str | None, mode: str | None = None) -> dt.date:
        selected_mode = mode or s.data_mode
        if date:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                raise HTTPException(422, "date must be YYYY-MM-DD")
            try:
                return dt.date.fromisoformat(date)
            except ValueError:  # passes the pattern but is not a real day, e.g. 2020-02-31 (incident I-4)
                raise HTTPException(422, f"'{date}' is not a valid calendar date") from None
        if selected_mode == "replay":
            raise HTTPException(422, "replay mode needs ?date=YYYY-MM-DD (archive data, e.g. 2020-02-25)")
        return target_date_for(time)

    def get_pipeline(mode: str | None) -> tuple[str, Pipeline]:
        selected_mode = mode or s.data_mode
        return selected_mode, pipelines[selected_mode]

    def unavailable(res) -> JSONResponse:
        return JSONResponse(status_code=503, content={
            "status": res.status, "message": res.message, "target_date": res.target_date.isoformat(),
            "request_id": res.request_id})

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse("/docs")

    @app.get("/api/v1/health")
    def health() -> dict:
        fp = get_predictor(str(s.models_dir))
        llm_up = llm.ping() if isinstance(llm, QwenClient) else False
        dates = replay_date_range(s)
        return {"status": "ok", "data_mode": s.data_mode, "model_unit": fp.unit,
                "available_modes": ["live", "replay"] if dates else ["live"],
                "model_versions": {m: fp.models[m]["meta"]["model_version"] for m in fp.modes},
                "areas": len(catalog.all()), "tools": tools.capabilities(),
                "llm": {"enabled": s.llm_enabled, "model": s.llm_model, "base_url": s.llm_base_url,
                        "reachable": llm_up},
                "tma_live": tools.tma_live.status() if s.data_mode == "live" and s.tma_live_enabled else None,
                "cache_ttl_s": s.cache_ttl_s,
                "replay_dates": dates}

    @app.get("/api/v1/heatmap")
    def heatmap(time: str = "5h", lat: float = -6.2088, lon: float = 106.8456,
                date: str | None = Query(None, description="Override target day (YYYY-MM-DD)"),
                mode: Literal["live", "replay"] | None = Query(None)):
        selected_mode, selected_pipeline = get_pipeline(mode)
        target = resolve_date(time, date, selected_mode)
        res = selected_pipeline.run(target)
        if res.status != "ok":
            return unavailable(res)
        return H.heatmap_response(res, time, (lat, lon))

    @app.get("/api/v1/analysis")
    def analysis(grid_id: str | None = None, lat: float | None = None, lon: float | None = None,
                 time: str = "5h", date: str | None = None,
                 mode: Literal["live", "replay"] | None = Query(None)):
        if not grid_id and (lat is None or lon is None):
            raise HTTPException(422, "give grid_id, or lat and lon")
        selected_mode, selected_pipeline = get_pipeline(mode)
        target = resolve_date(time, date, selected_mode)
        if grid_id and catalog.by_grid_id(grid_id) is None:
            raise HTTPException(404, f"unknown grid_id '{grid_id}'")
        res = selected_pipeline.run(
            target, grid_id=grid_id, lat=None if grid_id else lat, lon=None if grid_id else lon
        )
        if res.status != "ok" or not res.areas:
            return unavailable(res)
        a = res.areas[0]
        advice = advice_writer.write(AdviceFacts(a.area.name, target, a.risk_level, a.confidence,
                                                 a.rainfall_mm, a.water_level_cm))
        selected_pipeline.audit.write(res.request_id, {"step": "advice", **advice.audit()})
        return H.analysis_response(res, a, {**advice.value, "decided_by": advice.decided_by})

    @app.get("/api/v1/areas")
    def areas() -> dict:
        """Kecamatan names and ids, for the landing page search. No date needed."""
        return {"areas": [{"grid_id": k.grid_id, "name": k.name, "lat": k.lat, "lon": k.lon}
                          for k in sorted(catalog.all(), key=lambda k: k.name)]}

    @app.get("/api/v1/reports")
    def list_reports() -> dict:
        return {"reports": reports.active()}

    @app.post("/api/v1/reports", status_code=201)
    def add_report(rep: ReportIn) -> dict:
        area = catalog.nearest(rep.lat, rep.lon)
        try:
            return reports.add(rep, area.name, area.grid_id)
        except RateLimited:
            raise HTTPException(429, "Terlalu banyak laporan, coba lagi sebentar lagi.")

    # ---- Alternative route ----------------------------------------------------------------------------------
    @app.post("/api/v1/route")
    def route(req: RouteRequest) -> dict:
        """Fastest route vs the route that is least exposed to model-tier High areas and citizen flood reports."""
        o, d = (req.origin.lat, req.origin.lon), (req.destination.lat, req.destination.lon)
        gap = distance_m(o, d)
        if gap < MIN_METERS or gap > MAX_KM * 1000:
            raise HTTPException(422, f"origin and destination must be between {MIN_METERS:.0f} m and {MAX_KM:.0f} km apart")
        selected_mode, selected_pipeline = get_pipeline(req.mode)
        target = resolve_date(req.time, req.date, selected_mode)
        # Citizen flood reports count in live mode only, and never the demo examples (same rule as Flood Watch).
        flood_pts = sorted((round(r["lat"], 5), round(r["lon"], 5)) for r in reports.active()
                           if selected_mode == "live" and not r.get("demo") and r["condition"] == "banjir")
        key = ("route", selected_mode, target, round(o[0], 4), round(o[1], 4),
               round(d[0], 4), round(d[1], 4), tuple(flood_pts))
        if (hit := route_cache.get(key)) is not None:
            return hit
        if not route_limit.allow():
            raise HTTPException(429, "Terlalu banyak permintaan rute, coba lagi sebentar lagi.")
        res = selected_pipeline.run(target)
        if res.status != "ok":
            return unavailable(res)
        risk = RiskMap(res.areas, flood_pts, Projector((o[0] + d[0]) / 2, (o[1] + d[1]) / 2))
        try:
            plan = plan_route(router, risk, o, d)
        except NoRoute:
            raise HTTPException(422, "Tidak ada rute jalan antara kedua titik.")
        except RoutingError as exc:
            log.warning("routing failed: %s", exc)
            raise HTTPException(503, "Layanan routing tidak tersedia, coba lagi nanti.")

        # The LLM may re-word the explanation; its text is used only if it passes the checks (else the rule text).
        message, decided_by, errs = explain_route(llm, plan, s.route_llm_timeout_s)
        selected_pipeline.audit.write(res.request_id, {"step": "route_explain", "decided_by": decided_by,
                                                       "violations": errs, "prompt_version": ROUTE_PROMPT_VERSION})

        def view(r) -> dict:
            return {"coordinates": [[round(la, 5), round(lo, 5)] for la, lo in r.coords], "km": round(r.km, 1),
                    "minutes": round(r.minutes), "high_km": round(r.high_km, 1), "soft_km": round(r.soft_km, 1),
                    "flood_points": r.flood_points, "streets": [n for n, _ in r.streets[:5] if n]}
        out = {"target_date": target.isoformat(), "verdict": plan.verdict, "message": message, "explanation_by": decided_by,
               "recommended": view(plan.recommended), "fastest": view(plan.fastest),
               "same_as_fastest": plan.recommended is plan.fastest, "origin_area": plan.origin_area,
               "destination_area": plan.destination_area, "candidates": plan.candidates,
               "flood_points_known": plan.flood_points_known, "profile": s.route_costing}
        route_cache.set(key, out)
        return out

    # ---- Flood Watch Agent ----------------------------------------------------------------------------------
    @app.get("/api/v1/warnings")
    def warnings(limit: int = Query(20, ge=1, le=100)) -> dict:
        """Early-warning feed published by the Flood Watch Agent (newest first) and the last cycle's summary."""
        mem = watch.memory.data
        last = mem["decisions"][-1] if mem["decisions"] else None
        return {"active": [{"grid_id": g, **v} for g, v in watch.memory.active().items()],
                "warnings": list(reversed(mem["warnings"]))[:limit],
                "last_cycle": None if last is None else {k: last[k] for k in (
                    "cycle_id", "target_date", "at", "triggered", "decided_by") if k in last}}

    @app.post("/api/v1/watch/run")
    def watch_run(time: str = "1h", date: str | None = None) -> dict:
        """Run one Flood Watch cycle now and return its full decision trace (the "why" behind each warning).
        Replay mode needs ?date=YYYY-MM-DD; the cycle then acts as if it were that morning."""
        target = resolve_date(time, date)
        now = (dt.datetime.combine(target, dt.time(6, 0), tzinfo=WIB) if s.data_mode == "replay" else None)
        if not watch_run_limit.allow():
            raise HTTPException(429, "Terlalu banyak permintaan siklus Flood Watch, coba lagi sebentar lagi.")
        try:
            return watch.cycle(target, now=now, wait=False)
        except WatchBusy:
            raise HTTPException(409, "Siklus Flood Watch lain sedang berjalan, coba lagi sebentar lagi.")

    @app.post("/api/v1/watch/replay")
    def watch_replay(start: str, end: str) -> dict:
        """Replay mode only: run one cycle per day from start to end (at most 62 days) with a fresh, in-memory
        memory, so a demo can show warnings appearing and escalating over a past flood period."""
        if s.data_mode != "replay":
            raise HTTPException(422, "watch replay needs PAWANG_DATA_MODE=replay")
        d0, d1 = resolve_date("1h", start), resolve_date("1h", end)
        if d1 < d0 or (d1 - d0).days > 61:
            raise HTTPException(422, "end must be on or after start, at most 62 days")
        if not watch_replay_limit.allow():
            raise HTTPException(429, "Terlalu banyak permintaan replay, coba lagi sebentar lagi.")
        replay = FloodWatch(pipeline, llm, WatchMemory(None), cooldown_h=s.watch_cooldown_h)
        days = []
        d = d0
        while d <= d1:
            dec = replay.cycle(d, now=dt.datetime.combine(d, dt.time(6, 0), tzinfo=WIB))
            days.append({"date": d.isoformat(), "triggered": dec["triggered"], "decided_by": dec["decided_by"],
                         "changed_areas": len(dec["changes"]), "published": dec["published"],
                         "active": dec.get("active", {}), "cleared": dec.get("cleared", []),
                         "suppressed": len(dec["suppressed"]), "guardrail_errors": dec["guardrail_errors"]})
            d += dt.timedelta(days=1)
        return {"start": d0.isoformat(), "end": d1.isoformat(), "days": days,
                "warnings_total": sum(len(x["published"]) for x in days),
                "days_triggered": sum(x["triggered"] for x in days)}

    return app


app = create_app()
